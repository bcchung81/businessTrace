#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.news_service import NewsService

def test_news_fields():
    print("네이버와 구글 검색 결과 필드 확인 테스트 시작...")
    
    news_service = NewsService()
    
    # 테스트할 검색어
    test_query = "고스트패스"
    
    print(f"\n=== '{test_query}' 네이버 검색 결과 필드 확인 ===")
    
    # 네이버 검색 (5개만)
    naver_results = news_service.search_naver_news(test_query, display=5, max_results=5)
    
    if naver_results:
        print(f"네이버 검색 결과: {len(naver_results)}개")
        print("\n네이버 첫 번째 결과의 모든 필드:")
        first_item = naver_results[0]
        for key, value in first_item.items():
            print(f"  {key}: {value}")
        
        print("\n네이버 모든 결과의 주요 필드:")
        for i, item in enumerate(naver_results):
            print(f"  {i+1}. 제목: {item.get('title', 'N/A')}")
            print(f"     링크: {item.get('link', 'N/A')}")
            print(f"     설명: {item.get('description', 'N/A')[:100]}...")
            print(f"     발행일: {item.get('pubDate', 'N/A')}")
            print(f"     언론사: {item.get('originallink', 'N/A')}")
            print()
    
    print(f"\n=== '{test_query}' 구글 검색 결과 필드 확인 ===")
    
    # 구글 검색
    google_results = news_service.search_google_news(test_query)
    
    if google_results:
        print(f"구글 검색 결과: {len(google_results)}개")
        print("\n구글 첫 번째 결과의 모든 필드:")
        first_item = google_results[0]
        for key, value in first_item.items():
            print(f"  {key}: {value}")
        
        print("\n구글 처음 3개 결과의 주요 필드:")
        for i, item in enumerate(google_results[:3]):
            print(f"  {i+1}. 제목: {item.get('title', 'N/A')}")
            print(f"     링크: {item.get('link', 'N/A')}")
            print(f"     설명: {item.get('description', 'N/A')[:100]}...")
            print(f"     발행일: {item.get('published', 'N/A')}")
            print(f"     소스: {item.get('search_source', 'N/A')}")
            print()

if __name__ == "__main__":
    test_news_fields()
