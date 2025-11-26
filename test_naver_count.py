#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.news_service import NewsService
import time

def test_naver_api_count():
    print("네이버 API 호출 횟수 테스트 시작...")
    
    news_service = NewsService()
    
    # 테스트할 검색어
    query = "고스트패스"
    
    print(f"\n=== '{query}' 네이버 API 호출 횟수 테스트 ===")
    
    # API 호출 횟수를 카운트하기 위한 변수
    api_call_count = 0
    
    # 원본 search_naver_news 함수를 백업
    original_search = news_service.search_naver_news
    
    def counting_search_naver_news(query, display=100, max_results=1000):
        nonlocal api_call_count
        print(f"[NAVER] Searching for: '{query}' (max_results: {max_results})")
        
        headers = {
            'X-Naver-Client-Id': news_service.naver_client_id,
            'X-Naver-Client-Secret': news_service.naver_client_secret
        }
        
        # 정확한 검색을 위해 여러 방법 시도
        # 1. 따옴표로 감싸기
        exact_query = f'"{query}"'
        # 2. 검색어 앞뒤에 공백 추가하여 더 정확한 매칭
        # exact_query = f' {query} '
        print(f"[NAVER] Using exact query: '{exact_query}'")
        
        all_items = []
        current_start = 1
        
        while len(all_items) < max_results:
            # 현재 요청할 개수 계산
            remaining = max_results - len(all_items)
            current_display = min(display, remaining)
            
            params = {
                'query': exact_query,
                'display': current_display,
                'start': current_start,
                'sort': 'date'
            }
            
            print(f"[NAVER] API 호출 #{api_call_count + 1}: items {current_start}-{current_start + current_display - 1} (display: {current_display})")
            
            try:
                response = news_service.session.get(news_service.naver_news_url, headers=headers, params=params, timeout=10)
                response.raise_for_status()
                
                data = response.json()
                items = data.get('items', [])
                
                if not items:
                    print(f"[NAVER] No more items available at start={current_start}")
                    break
                
                # 검색 결과에 소스 정보 추가 및 정확한 검색어 필터링
                filtered_items = []
                for item in items:
                    title = item.get('title', '').lower()
                    description = item.get('description', '').lower()
                    
                    # 제목에 정확한 검색어가 포함된 경우만 포함 (더 엄격한 필터링)
                    if query.lower() in title:
                        item['search_source'] = '네이버뉴스검색'
                        item['query'] = query
                        filtered_items.append(item)
                
                all_items.extend(filtered_items)
                api_call_count += 1
                print(f"[NAVER] API 호출 #{api_call_count} 완료: Retrieved {len(items)} items, filtered to {len(filtered_items)} exact matches (total: {len(all_items)})")
                
                # 다음 페이지로 이동
                current_start += current_display
                
                # 네이버 API 제한: start는 최대 1000
                if current_start > 1000:
                    print(f"[NAVER] Reached maximum start position (1000)")
                    break
                
                # API 호출 간격 조절 (네이버 API 제한 고려)
                time.sleep(0.1)
                
            except Exception as e:
                print(f"[NAVER] Error at start={current_start}: {e}")
                break
        
        print(f"[NAVER] Total API calls: {api_call_count}")
        print(f"[NAVER] Total items retrieved: {len(all_items)}")
        return all_items
    
    # 함수 교체
    news_service.search_naver_news = counting_search_naver_news
    
    try:
        # 최대 1000개까지 가져오기
        results = news_service.search_naver_news(query, display=100, max_results=1000)
        print(f"\n=== 최종 결과 ===")
        print(f"네이버 검색 결과: {len(results)}개")
        print(f"총 API 호출 횟수: {api_call_count}회")
        
        if results:
            print(f"첫 번째 결과: {results[0].get('title', 'N/A')}")
            print(f"마지막 결과: {results[-1].get('title', 'N/A')}")
            
    except Exception as e:
        print(f"네이버 검색 오류: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_naver_api_count()
