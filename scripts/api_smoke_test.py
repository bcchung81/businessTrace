#!/usr/bin/env python3
"""외부 API 실증 스모크 테스트.

플랜(docs/superpowers/plans/2026-08-26-nextjs-rearchitecture.md)이 의존하는
외부 API 를 실제로 호출해 가용성과 응답 형태를 확인한다.

    uv run --python 3.12 --with requests --with python-dotenv scripts/api_smoke_test.py
"""

import io
import os
import xml.etree.ElementTree as ET
import zipfile

import requests
from dotenv import load_dotenv

load_dotenv()

COMPANIES = ["크립토랩", "올림플래닛", "넷록스", "페어리", "논스랩"]
REF_LISTED = "삼성전자"
REF_CORP_CODE = "00126380"
REF_B_NO = "1248100998"

results = []
_corp_code_cache = {}


def record(api, target, ok, detail):
    results.append((api, target, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL' if ok is False else 'WARN'}] {api} | {target} | {detail}")


def corp_codes(key):
    if not _corp_code_cache:
        r = requests.get(
            "https://opendart.fss.or.kr/api/corpCode.xml",
            params={"crtfc_key": key},
            timeout=60,
        )
        zf = zipfile.ZipFile(io.BytesIO(r.content))
        root = ET.fromstring(zf.read("CORPCODE.xml").decode("utf-8"))
        for entry in root.findall("list"):
            name = entry.findtext("corp_name")
            if name and name not in _corp_code_cache:
                _corp_code_cache[name] = entry.findtext("corp_code")
    return _corp_code_cache


def test_nts():
    key = os.environ.get("NTS_SERVICE_KEY", "")
    if not key:
        record("국세청", "-", None, "NTS_SERVICE_KEY 없음")
        return
    try:
        r = requests.post(
            "https://api.odcloud.kr/api/nts-businessman/v1/status",
            params={"serviceKey": key},
            json={"b_no": [REF_B_NO]},
            headers={"Content-Type": "application/json"},
            timeout=10,
        )
        r.raise_for_status()
        data = r.json()["data"][0]
        ok = data.get("b_stt_cd") == "01"
        record("국세청", f"{REF_LISTED}({REF_B_NO})", ok, f"상태: {data.get('b_stt')}, 과세유형: {data.get('tax_type')}")
    except requests.HTTPError as e:
        record("국세청", "-", False, f"HTTP {e.response.status_code}: {e.response.text[:80]}")
    except Exception as e:
        record("국세청", "-", False, f"호출 실패: {e}")


def test_dart_disclosure(corp_name):
    key = os.environ.get("DART_API_KEY", "")
    if not key:
        record("DART공시", corp_name, None, "DART_API_KEY 없음")
        return
    code = corp_codes(key).get(corp_name)
    if not code:
        record("DART공시", corp_name, None, "고유번호 미발견 (비상장 - 정상 폴백 케이스)")
        return
    try:
        r = requests.get(
            "https://opendart.fss.or.kr/api/list.json",
            params={
                "crtfc_key": key,
                "corp_code": code,
                "bgn_de": "20240101",
                "end_de": "20241231",
                "page_count": 10,
            },
            timeout=15,
        )
        r.raise_for_status()
        body = r.json()
        status = body.get("status")
        items = body.get("list", [])
        if status == "000" and items:
            record("DART공시", corp_name, True, f"2024년 공시 {len(items)}건 (최근: {items[0]['report_nm']})")
        elif status in ("000", "013"):
            record("DART공시", corp_name, None, "2024년 공시 없음 (정상 폴백 케이스)")
        elif status == "020":
            record("DART공시", corp_name, False, "API 키 제한 초과 (20 req/sec)")
        else:
            record("DART공시", corp_name, False, f"API 오류 status={status} msg={body.get('message')}")
    except Exception as e:
        record("DART공시", corp_name, False, f"호출 실패: {e}")


def test_dart_finstate(corp_name):
    key = os.environ.get("DART_API_KEY", "")
    if not key:
        return
    code = corp_codes(key).get(corp_name)
    if not code:
        record("DART재무", corp_name, None, "고유번호 미발견 (비상장 - 정상 폴백 케이스)")
        return
    try:
        fs = requests.get(
            "https://opendart.fss.or.kr/api/fnlttSinglAcnt.json",
            params={"crtfc_key": key, "corp_code": code, "bsns_year": "2024", "reprt_code": "11011"},
            timeout=15,
        ).json()
        if fs.get("status") == "000":
            revenue = [i for i in fs.get("list", []) if "매출액" in i.get("account_nm", "")]
            record("DART재무", corp_name, True, f"사업보고서 {len(fs.get('list', []))}항목, 매출액 {len(revenue)}건")
        else:
            record("DART재무", corp_name, None, f"재무제표 없음 status={fs.get('status')} ({fs.get('message', '')[:30]})")
    except Exception as e:
        record("DART재무", corp_name, False, f"호출 실패: {e}")


def test_dart_business_no(corp_name):
    key = os.environ.get("DART_API_KEY", "")
    if not key:
        return None
    code = corp_codes(key).get(corp_name)
    if not code:
        record("DART사업자번호", corp_name, None, "고유번호 미발견 (정상 폴백 케이스)")
        return None
    try:
        body = requests.get(
            "https://opendart.fss.or.kr/api/company.json",
            params={"crtfc_key": key, "corp_code": code},
            timeout=15,
        ).json()
        if body.get("status") == "000" and body.get("bizr_no"):
            record("DART사업자번호", corp_name, True, f"사업자번호 {body['bizr_no']}, 대표 {body.get('ceo_nm')}")
            return body["bizr_no"]
        record("DART사업자번호", corp_name, None, f"미제공 status={body.get('status')}")
    except Exception as e:
        record("DART사업자번호", corp_name, False, f"호출 실패: {e}")
    return None


def test_narajangteo(target, bizno):
    key = os.environ.get("G2B_SERVICE_KEY") or os.environ.get("NTS_SERVICE_KEY", "")
    if not key:
        record("나라장터", target, None, "G2B_SERVICE_KEY / NTS_SERVICE_KEY 없음")
        return
    try:
        r = requests.get(
            "https://apis.data.go.kr/1230000/ao/UsrInfoService02/getPrcrmntCorpBasicInfo02",
            params={
                "serviceKey": key,
                "inqryDiv": "3",
                "bizno": bizno,
                "type": "json",
                "numOfRows": "5",
                "pageNo": "1",
            },
            timeout=15,
        )
        if "NO_OPENAPI_SERVICE_ERROR" in r.text:
            record("나라장터", target, False, "엔드포인트 불일치 — ao/UsrInfoService02 확인 필요")
            return
        body = r.json().get("response", {}).get("body", {})
        items = body.get("items") or []
        if items:
            first = items[0] if isinstance(items, list) else items
            record(
                "나라장터",
                target,
                True,
                f"{first.get('corpNm')}, 대표 {first.get('ceoNm')}, 종업원 {first.get('emplyeNum')}명, 조달구분 {first.get('corpBsnsDivNm')}",
            )
        else:
            record("나라장터", target, None, f"조달업체 미등록 (totalCount={body.get('totalCount')})")
    except Exception as e:
        record("나라장터", target, False, f"호출 실패: {e}")


def test_naver_news():
    hub_id = os.environ.get("NCP_APIGW_API_KEY_ID", "")
    hub_key = os.environ.get("NCP_APIGW_API_KEY", "")
    if hub_id and hub_key:
        mode = "API HUB"
        url = "https://naverapihub.apigw.ntruss.com/search/v1/news"
        headers = {"X-NCP-APIGW-API-KEY-ID": hub_id, "X-NCP-APIGW-API-KEY": hub_key}
    else:
        mode = "개발자센터(레거시)"
        cid = os.environ.get("NAVER_CLIENT_ID", "")
        secret = os.environ.get("NAVER_CLIENT_SECRET", "")
        if not cid or not secret:
            record("네이버뉴스", "-", None, "NCP_APIGW_API_KEY_ID/KEY 또는 NAVER_CLIENT_ID/SECRET 없음")
            return
        url = "https://openapi.naver.com/v1/search/news.json"
        headers = {"X-Naver-Client-Id": cid, "X-Naver-Client-Secret": secret}
    try:
        r = requests.get(
            url,
            params={"query": REF_LISTED, "display": 5, "sort": "date"},
            headers=headers,
            timeout=10,
        )
        if r.status_code == 401:
            record(
                "네이버뉴스",
                f"{REF_LISTED} [{mode}]",
                False,
                "인증 실패 — 검색 API 는 NAVER API HUB 로 이관됨. 네이버 클라우드에서 발급 후 NCP_APIGW_API_KEY_ID/KEY 설정",
            )
            return
        r.raise_for_status()
        body = r.json()
        record("네이버뉴스", f"{REF_LISTED} [{mode}]", True, f"총 {body.get('total')}건, 수신 {len(body.get('items', []))}건")
    except Exception as e:
        record("네이버뉴스", f"-  [{mode}]", False, f"호출 실패: {e}")


def test_tavily():
    key = os.environ.get("TAVILY_API_KEY", "")
    if not key:
        record("Tavily", "-", None, "TAVILY_API_KEY 없음")
        return
    try:
        r = requests.post(
            "https://api.tavily.com/search",
            json={"api_key": key, "query": f"{REF_LISTED} 최근 동향", "max_results": 3},
            timeout=20,
        )
        r.raise_for_status()
        record("Tavily", REF_LISTED, True, f"검색결과 {len(r.json().get('results', []))}건")
    except requests.HTTPError as e:
        record("Tavily", "-", False, f"HTTP {e.response.status_code}: {e.response.text[:80]}")
    except Exception as e:
        record("Tavily", "-", False, f"호출 실패: {e}")


def test_anthropic():
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        record("Anthropic", "-", None, "ANTHROPIC_API_KEY 없음")
        return
    try:
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={
                "model": "claude-sonnet-4-5",
                "max_tokens": 32,
                "messages": [{"role": "user", "content": "테스트. 'OK'만 응답하세요."}],
            },
            timeout=30,
        )
        r.raise_for_status()
        text = r.json()["content"][0]["text"].strip()
        record("Anthropic", "claude-sonnet-4-5", True, f"응답: {text[:30]}")
    except requests.HTTPError as e:
        record("Anthropic", "-", False, f"HTTP {e.response.status_code}: {e.response.text[:100]}")
    except Exception as e:
        record("Anthropic", "-", False, f"호출 실패: {e}")


if __name__ == "__main__":
    print("=" * 70)
    print("API Smoke 테스트 시작")
    print("=" * 70)
    print("기준 기업 (상장·공시 이력 있음)")
    print("-" * 70)
    test_nts()
    test_narajangteo(REF_LISTED, REF_B_NO)
    test_naver_news()
    test_tavily()
    test_anthropic()
    test_dart_disclosure(REF_LISTED)
    test_dart_finstate(REF_LISTED)
    test_dart_business_no(REF_LISTED)
    print("-" * 70)
    print("검증 대상 5개사")
    print("-" * 70)
    for company in COMPANIES:
        test_dart_disclosure(company)
        test_dart_finstate(company)
        bizno = test_dart_business_no(company)
        if bizno:
            test_narajangteo(company, bizno)
    print("=" * 70)
    passed = sum(1 for _, _, ok, _ in results if ok is True)
    warned = sum(1 for _, _, ok, _ in results if ok is None)
    failed = sum(1 for _, _, ok, _ in results if ok is False)
    print(f"결과: PASS {passed} / WARN(폴백·미발견) {warned} / FAIL {failed}")
    raise SystemExit(1 if failed else 0)
