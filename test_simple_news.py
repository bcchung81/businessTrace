#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.news_service_simple import NewsService

def test_simple_news():
    print("간단한 뉴스 검색 테스트 시작...")
    
    news_service = NewsService()
    
    # 테스트할 검색어들
    test_queries = ["고스트패스", "주식", "삼성전자"]
    
    for query in test_queries:
        print(f"\n=== '{query}' 검색 테스트 ===")
        
        # 1. 네이버만 테스트
        print(f"\n--- 네이버만 테스트 ---")
        try:
            results = news_service.search_naver_news(query)
            print(f"네이버 검색 결과: {len(results)}개")
            if results:
                print(f"첫 번째 결과: {results[0].get('title', 'N/A')}")
                print(f"첫 번째 결과 소스: {results[0].get('search_source', 'N/A')}")
        except Exception as e:
            print(f"네이버 검색 오류: {e}")
        
        # 2. 구글만 테스트
        print(f"\n--- 구글만 테스트 ---")
        try:
            results = news_service.search_google_news(query)
            print(f"구글 검색 결과: {len(results)}개")
            if results:
                print(f"첫 번째 결과: {results[0].get('title', 'N/A')}")
                print(f"첫 번째 결과 소스: {results[0].get('search_source', 'N/A')}")
        except Exception as e:
            print(f"구글 검색 오류: {e}")
        
        # 3. 통합 검색 테스트
        print(f"\n--- 통합 검색 테스트 (네이버 + 구글) ---")
        try:
            results = news_service.search_news(query, naver_enabled=True, google_enabled=True)
            print(f"통합 검색 결과: {results.get('total_after_dedup', 0)}개")
            print(f"네이버 결과: {len([r for r in results.get('news', []) if r.get('search_source') == '네이버뉴스검색'])}개")
            print(f"구글 결과: {len([r for r in results.get('news', []) if r.get('search_source') == '구글뉴스검색'])}개")
            
            if results.get('news'):
                print(f"첫 번째 결과: {results['news'][0].get('title', 'N/A')}")
                print(f"첫 번째 결과 소스: {results['news'][0].get('search_source', 'N/A')}")
        except Exception as e:
            print(f"통합 검색 오류: {e}")

if __name__ == "__main__":
    test_simple_news()
