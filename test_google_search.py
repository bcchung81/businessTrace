#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.news_service import NewsService

def test_google_search():
    print("구글 검색 테스트 시작...")
    
    news_service = NewsService()
    
    # 테스트 쿼리들
    test_queries = ["고스트패스", "주식", "삼성전자"]
    
    for query in test_queries:
        print(f"\n=== '{query}' 검색 테스트 ===")
        try:
            results = news_service.search_google_news(query)
            print(f"결과 개수: {len(results)}")
            if results:
                print(f"첫 번째 결과: {results[0].get('title', 'N/A')}")
                print(f"첫 번째 결과 URL: {results[0].get('link', 'N/A')}")
            else:
                print("결과 없음")
        except Exception as e:
            print(f"오류 발생: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    test_google_search()
