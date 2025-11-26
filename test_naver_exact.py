#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.news_service import NewsService

def test_naver_exact():
    print("네이버 정확한 검색 테스트 시작...")
    
    news_service = NewsService()
    
    # 테스트할 검색어들
    test_queries = ["고스트패스", "주식", "삼성전자"]
    
    for query in test_queries:
        print(f"\n=== '{query}' 네이버 정확한 검색 테스트 ===")
        
        try:
            # 정확한 검색으로 최대 1000개까지 가져오기
            results = news_service.search_naver_news(query, display=100, max_results=1000)
            print(f"네이버 검색 결과: {len(results)}개")
            
            if results:
                print(f"첫 번째 결과: {results[0].get('title', 'N/A')}")
                print(f"마지막 결과: {results[-1].get('title', 'N/A')}")
                print(f"첫 번째 결과 소스: {results[0].get('search_source', 'N/A')}")
                
                # 검색어가 제목에 포함된 결과 확인
                query_in_title_count = 0
                for item in results:
                    title = item.get('title', '').lower()
                    if query.lower() in title:
                        query_in_title_count += 1
                
                print(f"제목에 '{query}'가 포함된 결과: {query_in_title_count}개")
                print(f"정확도: {query_in_title_count/len(results)*100:.1f}%")
                
                # 처음 5개 결과의 제목 출력
                print("처음 5개 결과:")
                for i, item in enumerate(results[:5]):
                    title = item.get('title', 'N/A')
                    print(f"  {i+1}. {title}")
                
        except Exception as e:
            print(f"네이버 검색 오류: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    test_naver_exact()
