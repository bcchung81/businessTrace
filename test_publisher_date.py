#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.news_service import NewsService

def test_publisher_date():
    print("언론사와 날짜 정보 처리 테스트 시작...")
    
    news_service = NewsService()
    
    # 테스트할 검색어
    query = "고스트패스"
    
    print(f"\n=== '{query}' 언론사/날짜 정보 테스트 ===")
    
    try:
        # 네이버 검색만 테스트
        print("\n--- 네이버 검색 결과 ---")
        naver_items = news_service.search_naver_news(query, max_results=5)
        
        for i, item in enumerate(naver_items[:3], 1):
            print(f"\n{i}. 네이버 결과:")
            print(f"   제목: {item.get('title', 'N/A')}")
            print(f"   언론사: {item.get('publisher', 'N/A')}")
            print(f"   날짜: {item.get('published', 'N/A')}")
            print(f"   링크: {item.get('originallink', 'N/A')}")
        
        # 구글 검색만 테스트
        print("\n--- 구글 검색 결과 ---")
        google_items = news_service.search_google_news(query)
        
        for i, item in enumerate(google_items[:3], 1):
            print(f"\n{i}. 구글 결과:")
            print(f"   제목: {item.get('title', 'N/A')}")
            print(f"   언론사: {item.get('publisher', 'N/A')}")
            print(f"   날짜: {item.get('published', 'N/A')}")
            print(f"   링크: {item.get('link', 'N/A')}")
        
        # 통합 검색 테스트
        print("\n--- 통합 검색 결과 ---")
        results = news_service.search_news(query, naver_enabled=True, google_enabled=True)
        
        print(f"총 결과 수: {len(results['news'])}")
        
        # 소스별 결과 수 계산
        source_counts = {}
        publisher_counts = {}
        
        for item in results['news']:
            source = item.get('search_source', 'unknown')
            source_counts[source] = source_counts.get(source, 0) + 1
            
            publisher = item.get('publisher', '알 수 없음')
            publisher_counts[publisher] = publisher_counts.get(publisher, 0) + 1
        
        print(f"소스별 결과 수: {source_counts}")
        print(f"언론사별 결과 수 (상위 10개): {dict(list(publisher_counts.items())[:10])}")
        
    except Exception as e:
        print(f"테스트 오류: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_publisher_date()
