#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.news_service import NewsService

def test_parse_fixed():
    print("수정된 파싱 로직 테스트 시작...")
    
    news_service = NewsService()
    
    # 테스트할 검색어
    query = "고스트패스"
    
    print(f"\n=== '{query}' 수정된 파싱 결과 ===")
    
    try:
        # 네이버 검색 결과 분석
        print("\n--- 네이버 검색 결과 (수정됨) ---")
        naver_results = news_service.search_naver_news(query, max_results=3)
        
        for i, item in enumerate(naver_results[:3]):
            print(f"\n네이버 결과 #{i+1}:")
            print(f"  제목: {item.get('title', 'N/A')}")
            print(f"  언론사: {item.get('publisher', 'N/A')}")
            print(f"  발행일: {item.get('published', 'N/A')}")
            print(f"  링크: {item.get('link', 'N/A')}")
        
        # 구글 검색 결과 분석
        print("\n--- 구글 검색 결과 (수정됨) ---")
        google_results = news_service.search_google_news(query)
        
        for i, item in enumerate(google_results[:3]):
            print(f"\n구글 결과 #{i+1}:")
            print(f"  제목: {item.get('title', 'N/A')}")
            print(f"  언론사: {item.get('publisher', 'N/A')}")
            print(f"  발행일: {item.get('published', 'N/A')}")
            print(f"  링크: {item.get('link', 'N/A')}")
            
    except Exception as e:
        print(f"검색 오류: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_parse_fixed()
