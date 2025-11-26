#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import requests
import json

def test_frontend_press():
    print("프론트엔드 언론사명 표시 확인 테스트 시작...")
    
    # 테스트할 검색어
    test_query = "고스트패스"
    
    print(f"\n=== '{test_query}' 검색 결과의 언론사명 필드 확인 ===")
    
    # 웹 API 호출
    url = "http://localhost:5001/api/search/period"
    params = {
        'q': test_query,
        'start_date': '2023-01-01',
        'end_date': '2025-12-31',
        'naver': 'true',
        'google': 'true',
        'duplicate_threshold': '0.5'
    }
    
    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        
        data = response.json()
        results = data.get('results', [])
        
        print(f"총 결과 수: {len(results)}")
        
        if results:
            print("\n처음 10개 결과의 언론사명 확인:")
            for i, item in enumerate(results[:10]):
                title = item.get('title', 'N/A')
                press_name = item.get('press_name', 'N/A')
                source = item.get('source', 'N/A')
                search_source = item.get('search_source', 'N/A')
                
                print(f"  {i+1}. 제목: {title[:50]}...")
                print(f"     press_name: {press_name}")
                print(f"     source: {source}")
                print(f"     search_source: {search_source}")
                print()
        
    except Exception as e:
        print(f"웹 API 호출 오류: {e}")

if __name__ == "__main__":
    test_frontend_press()
