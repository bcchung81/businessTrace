#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.news_service import NewsService

def test_parse_debug():
    print("네이버/구글 데이터 파싱 디버그 시작...")
    
    news_service = NewsService()
    
    # 테스트할 검색어
    query = "고스트패스"
    
    print(f"\n=== '{query}' 데이터 구조 분석 ===")
    
    try:
        # 네이버 검색 결과 분석
        print("\n--- 네이버 검색 결과 분석 ---")
        naver_results = news_service.search_naver_news(query, max_results=5)
        
        for i, item in enumerate(naver_results[:3]):
            print(f"\n네이버 결과 #{i+1}:")
            print(f"  제목: {item.get('title', 'N/A')}")
            print(f"  원본링크: {item.get('originallink', 'N/A')}")
            print(f"  링크: {item.get('link', 'N/A')}")
            print(f"  설명: {item.get('description', 'N/A')[:100]}...")
            print(f"  발행일: {item.get('pubDate', 'N/A')}")
            print(f"  전체 키: {list(item.keys())}")
        
        # 구글 검색 결과 분석
        print("\n--- 구글 검색 결과 분석 ---")
        google_results = news_service.search_google_news(query)
        
        for i, item in enumerate(google_results[:3]):
            print(f"\n구글 결과 #{i+1}:")
            print(f"  제목: {item.get('title', 'N/A')}")
            print(f"  링크: {item.get('link', 'N/A')}")
            print(f"  설명: {item.get('description', 'N/A')[:100]}...")
            print(f"  발행일: {item.get('published', 'N/A')}")
            print(f"  전체 키: {list(item.keys())}")
            
    except Exception as e:
        print(f"검색 오류: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_parse_debug()
