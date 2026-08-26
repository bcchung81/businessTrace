import os
import sys

import requests
from dotenv import load_dotenv

load_dotenv()

COMPANIES = ["크립토랩", "올림플래닛", "넷록스", "페어리", "논스랩"]
REF_LISTED = "티맥스소프트"
REF_B_NO = "1248100998"

results = []


def record(api, target, ok, detail):
    results.append((api, target, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL' if ok is False else 'WARN'}] {api} | {target} | {detail}")


def test_nts():
    key = os.environ.get("NTS_SERVICE_KEY", "")
    if not key:
        record("국세청", "-", None, "NTS_SERVICE_KEY 없음")
        return
    try:
        r = requests.post(
            f"https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey={key}",
            json={"b_no": [REF_B_NO]},
            headers={"Content-Type": "application/json"},
            timeout=10,
        )
        r.raise_for_status()
        data = r.json()["data"][0]
        ok = data.get("b_stt_cd") == "01"
        record("국세청", f"삼성전자({REF_B_NO})", ok, f"상태: {data.get('b_stt')}, 과세유형: {data.get('tax_type')}")
    except Exception as e:
        record("국세청", "-", False, f"호출 실패: {e}")


def test_dart(corp_name):
    key = os.environ.get("DART_API_KEY", "")
    if not key:
        record("DART", corp_name, None, "DART_API_KEY 없음")
        return
    try:
        r = requests.get(
            "https://opendart.fss.or.kr/api/list.json",
            params={"crtfc_key": key, "corp_name": corp_name, "page_count": 10},
            timeout=10,
        )
        r.raise_for_status()
        body = r.json()
        status = body.get("status")
        if status == "000":
            items = [i for i in body.get("list", []) if i.get("corp_name") == corp_name]
            record("DART", corp_name, True, f"공시 {len(items)}건 검색됨 (최근: {items[0]['report_nm'] if items else '-'})")
        elif status == "013":
            record("DART", corp_name, None, "검색 결과 없음 (비상장/공시 이력 없음 - 정상 폴백 케이스)")
        elif status == "020":
            record("DART", corp_name, False, "API 키 제한 초과 (20 req/sec)")
        elif status in ("010", "011", "021", "100", "800", "900"):
            record("DART", corp_name, False, f"API 오류 status={status} msg={body.get('message')}")
        else:
            record("DART", corp_name, None, f"status={status} msg={body.get('message')}")
    except Exception as e:
        record("DART", corp_name, False, f"호출 실패: {e}")


def test_dart_finstate(corp_name):
    key = os.environ.get("DART_API_KEY", "")
    try:
        r = requests.get(
            "https://opendart.fss.or.kr/api/corpCode.xml",
            params={"crtfc_key": key},
            timeout=30,
        )
        import io
        import zipfile

        zf = zipfile.ZipFile(io.BytesIO(r.content))
        import xml.etree.ElementTree as ET

        root = ET.fromstring(zf.read("CORPCODE.xml").decode("utf-8"))
        matches = [c for c in root.findall("list") if c.findtext("corp_name") == corp_name]
        if not matches:
            record("DART재무", corp_name, None, "고유번호 미발견 (비상장 - 정상 폴백 케이스)")
            return
        corp_code = matches[0].findtext("corp_code")
        fs = requests.get(
            "https://opendart.fss.or.kr/api/fnlttSinglAcnt.json",
            params={"crtfc_key": key, "corp_code": corp_code, "bsns_year": "2024", "reprt_code": "11013"},
            timeout=10,
        ).json()
        if fs.get("status") == "000":
            revenue = [i for i in fs.get("list", []) if "매출액" in i.get("account_nm", "")]
            record("DART재무", corp_name, True, f"고유번호 {corp_code}, 재무제표 {len(fs.get('list', []))}항목, 매출액 항목 {len(revenue)}건")
        else:
            record("DART재무", corp_name, None, f"재무제표 없음 status={fs.get('status')} ({fs.get('message', '')[:30]})")
    except Exception as e:
        record("DART재무", corp_name, False, f"호출 실패: {e}")


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
        record("Anthropic", "claude-sonnet-4", True, f"응답: {text[:30]}")
    except requests.HTTPError as e:
        record("Anthropic", "-", False, f"HTTP {e.response.status_code}: {e.response.text[:100]}")
    except Exception as e:
        record("Anthropic", "-", False, f"호출 실패: {e}")


if __name__ == "__main__":
    print("=" * 70)
    print("API Smoke 테스트 시작")
    print("=" * 70)
    test_nts()
    test_anthropic()
    test_dart(REF_LISTED)
    test_dart_finstate(REF_LISTED)
    print("-" * 70)
    print("검증 대상 5개사 (2024년 상위)")
    print("-" * 70)
    for c in COMPANIES:
        test_dart(c)
        test_dart_finstate(c)
    print("=" * 70)
    passed = sum(1 for _, _, ok, _ in results if ok is True)
    warned = sum(1 for _, _, ok, _ in results if ok is None)
    failed = sum(1 for _, _, ok, _ in results if ok is False)
    print(f"결과: PASS {passed} / WARN(폴백·미발견) {warned} / FAIL {failed}")
