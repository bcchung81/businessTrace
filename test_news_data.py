#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.news_service import NewsService

def test_news_data_structure():
    """네이버와 구글 검색 결과의 데이터 구조를 확인"""
    print("뉴스 데이터 구조 테스트 시작...\n")
    
    news_service = NewsService()
    
    # 테스트할 검색어
    test_query = "고스트패스"
    
    print(f"=== '{test_query}' 네이버 검색 결과 데이터 구조 ===")
    naver_results = news_service.search_naver_news(test_query, max_results=5)
    
    if naver_results:
        print(f"네이버 검색 결과: {len(naver_results)}개")
        for i, item in enumerate(naver_results[:3], 1):
            print(f"\n{i}번째 네이버 결과:")
            print(f"  제목: {item.get('title', 'N/A')}")
            print(f"  링크: {item.get('link', 'N/A')}")
            print(f"  원본링크: {item.get('originallink', 'N/A')}")
            print(f"  설명: {item.get('description', 'N/A')[:100]}...")
            print(f"  발행일: {item.get('pubDate', 'N/A')}")
            print(f"  published: {item.get('published', 'N/A')}")
            print(f"  언론사명: {item.get('press_name', 'N/A')}")
            print(f"  검색소스: {item.get('search_source', 'N/A')}")
            print(f"  쿼리: {item.get('query', 'N/A')}")
            print(f"  전체 키: {list(item.keys())}")
    else:
        print("네이버 검색 결과가 없습니다.")
    
    print(f"\n=== '{test_query}' 구글 검색 결과 데이터 구조 ===")
    google_results = news_service.search_google_news(test_query)
    
    if google_results:
        print(f"구글 검색 결과: {len(google_results)}개")
        for i, item in enumerate(google_results[:3], 1):
            print(f"\n{i}번째 구글 결과:")
            print(f"  제목: {item.get('title', 'N/A')}")
            print(f"  링크: {item.get('link', 'N/A')}")
            print(f"  설명: {item.get('description', 'N/A')[:100]}...")
            print(f"  발행일: {item.get('pubDate', 'N/A')}")
            print(f"  published: {item.get('published', 'N/A')}")
            print(f"  언론사명: {item.get('press_name', 'N/A')}")
            print(f"  검색소스: {item.get('search_source', 'N/A')}")
            print(f"  쿼리: {item.get('query', 'N/A')}")
            print(f"  전체 키: {list(item.keys())}")
    else:
        print("구글 검색 결과가 없습니다.")

if __name__ == "__main__":
    test_news_data_structure()
