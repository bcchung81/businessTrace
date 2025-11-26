#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import requests
import json

def test_web_publisher():
    print("웹 애플리케이션 언론사/날짜 정보 테스트 시작...")
    
    # 웹 API 엔드포인트
    url = "http://localhost:5001/api/search/period"
    
    # 테스트 파라미터
    params = {
        'query': '고스트패스',
        'naver_enabled': 'true',
        'google_enabled': 'true',
        'duplicate_threshold': '0.5'
    }
    
    try:
        print(f"API 호출: {url}")
        print(f"파라미터: {params}")
        
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        
        data = response.json()
        
        print(f"\n=== API 응답 ===")
        print(f"상태 코드: {response.status_code}")
        print(f"총 뉴스 수: {len(data.get('news', []))}")
        
        # 소스별 결과 수 계산
        source_counts = {}
        publisher_counts = {}
        
        for item in data.get('news', []):
            source = item.get('search_source', 'unknown')
            source_counts[source] = source_counts.get(source, 0) + 1
            
            publisher = item.get('publisher', '알 수 없음')
            publisher_counts[publisher] = publisher_counts.get(publisher, 0) + 1
        
        print(f"소스별 결과 수: {source_counts}")
        print(f"언론사별 결과 수 (상위 10개): {dict(list(publisher_counts.items())[:10])}")
        
        # 상세 정보 출력 (처음 3개)
        print(f"\n=== 상세 정보 (처음 3개) ===")
        for i, item in enumerate(data.get('news', [])[:3], 1):
            print(f"\n{i}. 뉴스:")
            print(f"   제목: {item.get('title', 'N/A')}")
            print(f"   언론사: {item.get('publisher', 'N/A')}")
            print(f"   날짜: {item.get('published', 'N/A')}")
            print(f"   소스: {item.get('search_source', 'N/A')}")
            print(f"   링크: {item.get('link', 'N/A')}")
        
        # 중복 제거 정보
        if 'total_before_dedup' in data:
            print(f"\n=== 중복 제거 정보 ===")
            print(f"중복 제거 전: {data.get('total_before_dedup', 0)}개")
            print(f"중복 제거 후: {data.get('total_after_dedup', 0)}개")
            print(f"제거된 중복: {data.get('duplicates_removed', 0)}개")
        
    except requests.exceptions.RequestException as e:
        print(f"API 호출 오류: {e}")
    except json.JSONDecodeError as e:
        print(f"JSON 파싱 오류: {e}")
    except Exception as e:
        print(f"테스트 오류: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_web_publisher()
