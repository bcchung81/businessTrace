#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.news_service import NewsService

def test_naver_max():
    print("네이버 최대 검색 결과 테스트 시작...")
    
    news_service = NewsService()
    
    # 테스트할 검색어들
    test_queries = ["고스트패스", "주식", "삼성전자"]
    
    for query in test_queries:
        print(f"\n=== '{query}' 네이버 최대 검색 테스트 ===")
        
        try:
            # 최대 1000개까지 가져오기
            results = news_service.search_naver_news(query, display=100, max_results=1000)
            print(f"네이버 검색 결과: {len(results)}개")
            
            if results:
                print(f"첫 번째 결과: {results[0].get('title', 'N/A')}")
                print(f"마지막 결과: {results[-1].get('title', 'N/A')}")
                print(f"첫 번째 결과 소스: {results[0].get('search_source', 'N/A')}")
                
                # 중복 제거 확인
                titles = [item.get('title', '') for item in results]
                unique_titles = set(titles)
                print(f"중복 제거 전: {len(titles)}개")
                print(f"중복 제거 후: {len(unique_titles)}개")
                print(f"중복된 항목: {len(titles) - len(unique_titles)}개")
                
        except Exception as e:
            print(f"네이버 검색 오류: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    test_naver_max()
