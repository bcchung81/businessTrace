#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import requests
import json

def test_web_google():
    print("웹 애플리케이션 구글 검색 테스트 시작...")
    
    # 테스트할 검색어들
    test_queries = ["고스트패스", "주식", "삼성전자"]
    
    for query in test_queries:
        print(f"\n=== '{query}' 웹 구글 검색 테스트 ===")
        url = "http://localhost:5001/api/search/period"
        params = {
            'q': query,
            'start_date': '2023-01-01',
            'end_date': '2025-12-31',
            'naver': 'false',  # 네이버 비활성화
            'google': 'true',  # 구글만 활성화
            'duplicate_threshold': '0.5'
        }
        
        try:
            print(f"요청 URL: {url}")
            print(f"요청 파라미터: {params}")
            
            response = requests.get(url, params=params)
            print(f"응답 상태 코드: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"응답 데이터 키: {list(data.keys())}")
                print(f"총 결과 수: {data.get('count', 0)}")
                print(f"중복 제거 전: {data.get('total_before_dedup', 0)}")
                print(f"중복 제거 후: {data.get('total_after_dedup', 0)}")
                print(f"제거된 중복: {data.get('duplicates_removed', 0)}")
                
                if data.get('results'):
                    print(f"첫 번째 결과: {data['results'][0].get('title', 'N/A')}")
                    print(f"첫 번째 결과 소스: {data['results'][0].get('search_source', 'N/A')}")
                    
                    # 소스별 결과 수 계산
                    sources = {}
                    for result in data['results']:
                        source = result.get('search_source', 'Unknown')
                        sources[source] = sources.get(source, 0) + 1
                    print(f"소스별 결과 수: {sources}")
                    
                    # 처음 5개 결과의 소스 출력
                    print("처음 5개 결과의 소스:")
                    for i, result in enumerate(data['results'][:5]):
                        print(f"  {i+1}. {result.get('search_source', 'Unknown')}: {result.get('title', 'N/A')[:50]}...")
                else:
                    print("결과 없음")
            else:
                print(f"오류 응답: {response.text}")
                
        except Exception as e:
            print(f"요청 오류: {e}")

if __name__ == "__main__":
    test_web_google()
