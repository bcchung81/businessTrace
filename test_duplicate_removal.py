#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
중복 제거 기능 테스트 스크립트
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.news_service import NewsService

def test_title_normalization():
    """제목 정규화 기능 테스트"""
    print("=== 제목 정규화 테스트 ===")
    
    news_service = NewsService()
    
    test_titles = [
        "삼성전자, AI 칩 개발 성과 발표 (조선일보)",
        "삼성전자, AI 칩 개발 성과 발표 (동아일보)",
        "삼성전자, AI 칩 개발 성과 발표 (중앙일보)",
        "LG전자 신제품 출시 (한국경제)",
        "LG전자 신제품 출시 (매일경제)",
        "SK하이닉스 실적 발표한다 (연합뉴스)",
        "SK하이닉스 실적 발표한다 (뉴시스)",
        "현대차 전기차 판매량 증가 (이데일리)",
        "현대차 전기차 판매량 증가 (머니투데이)",
        "기업 분석 리포트 발간 (전자신문)",
        "기업 분석 리포트 발간 (지디넷)",
        "보안 솔루션 출시 (보안뉴스)",
        "보안 솔루션 출시 (KBS)",
        "테크 뉴스 요약 (MBC)",
        "테크 뉴스 요약 (SBS)",
        "IT 업계 동향 (JTBC)",
        "IT 업계 동향 (YTN)",
        "스타트업 투자 소식 (노컷뉴스)",
        "스타트업 투자 소식 (오마이뉴스)",
        "벤처 기업 성장 (프레시안)",
        "벤처 기업 성장 (미디어오늘)",
        "일반적인 뉴스 제목 (테스트)",
        "일반적인 뉴스 제목 (테스트)",
    ]
    
    print("원본 제목 -> 정규화된 제목:")
    print("-" * 80)
    
    for title in test_titles:
        normalized = news_service._normalize_title(title)
        print(f"원본: {title}")
        print(f"정규화: {normalized}")
        print("-" * 40)

def test_duplicate_removal():
    """중복 제거 기능 테스트"""
    print("\n=== 중복 제거 테스트 ===")
    
    news_service = NewsService()
    
    # 테스트용 뉴스 데이터
    test_news = [
        {
            'title': '삼성전자, AI 칩 개발 성과 발표 (조선일보)',
            'published': 'Thu, 12 Jun 2025 09:14:00 +0900',
            'source': '조선일보',
            'link': 'http://example1.com',
            'description': '삼성전자가 AI 칩 개발 성과를 발표했다.'
        },
        {
            'title': '삼성전자, AI 칩 개발 성과 발표 (동아일보)',
            'published': 'Thu, 12 Jun 2025 09:14:00 +0900',
            'source': '동아일보',
            'link': 'http://example2.com',
            'description': '삼성전자가 AI 칩 개발 성과를 발표했다.'
        },
        {
            'title': '삼성전자, AI 칩 개발 성과 발표 (중앙일보)',
            'published': 'Thu, 12 Jun 2025 09:14:00 +0900',
            'source': '중앙일보',
            'link': 'http://example3.com',
            'description': '삼성전자가 AI 칩 개발 성과를 발표했다.'
        },
        {
            'title': 'LG전자 신제품 출시 (한국경제)',
            'published': 'Thu, 12 Jun 2025 10:00:00 +0900',
            'source': '한국경제',
            'link': 'http://example4.com',
            'description': 'LG전자가 신제품을 출시했다.'
        },
        {
            'title': 'LG전자 신제품 출시 (매일경제)',
            'published': 'Thu, 12 Jun 2025 10:00:00 +0900',
            'source': '매일경제',
            'link': 'http://example5.com',
            'description': 'LG전자가 신제품을 출시했다.'
        },
        {
            'title': 'SK하이닉스 실적 발표한다 (연합뉴스)',
            'published': 'Thu, 12 Jun 2025 11:00:00 +0900',
            'source': '연합뉴스',
            'link': 'http://example6.com',
            'description': 'SK하이닉스가 실적을 발표한다.'
        },
        {
            'title': 'SK하이닉스 실적 발표한다 (뉴시스)',
            'published': 'Thu, 12 Jun 2025 11:00:00 +0900',
            'source': '뉴시스',
            'link': 'http://example7.com',
            'description': 'SK하이닉스가 실적을 발표한다.'
        },
        {
            'title': '현대차 전기차 판매량 증가 (이데일리)',
            'published': 'Thu, 12 Jun 2025 12:00:00 +0900',
            'source': '이데일리',
            'link': 'http://example8.com',
            'description': '현대차 전기차 판매량이 증가했다.'
        },
        {
            'title': '현대차 전기차 판매량 증가 (머니투데이)',
            'published': 'Thu, 12 Jun 2025 12:00:00 +0900',
            'source': '머니투데이',
            'link': 'http://example9.com',
            'description': '현대차 전기차 판매량이 증가했다.'
        },
        {
            'title': '기업 분석 리포트 발간 (전자신문)',
            'published': 'Thu, 12 Jun 2025 13:00:00 +0900',
            'source': '전자신문',
            'link': 'http://example10.com',
            'description': '기업 분석 리포트가 발간되었다.'
        },
        {
            'title': '기업 분석 리포트 발간 (지디넷)',
            'published': 'Thu, 12 Jun 2025 13:00:00 +0900',
            'source': '지디넷',
            'link': 'http://example11.com',
            'description': '기업 분석 리포트가 발간되었다.'
        },
        {
            'title': '보안 솔루션 출시 (보안뉴스)',
            'published': 'Thu, 12 Jun 2025 14:00:00 +0900',
            'source': '보안뉴스',
            'link': 'http://example12.com',
            'description': '보안 솔루션이 출시되었다.'
        },
        {
            'title': '보안 솔루션 출시 (KBS)',
            'published': 'Thu, 12 Jun 2025 14:00:00 +0900',
            'source': 'KBS',
            'link': 'http://example13.com',
            'description': '보안 솔루션이 출시되었다.'
        },
        {
            'title': '테크 뉴스 요약 (MBC)',
            'published': 'Thu, 12 Jun 2025 15:00:00 +0900',
            'source': 'MBC',
            'link': 'http://example14.com',
            'description': '테크 뉴스를 요약했다.'
        },
        {
            'title': '테크 뉴스 요약 (SBS)',
            'published': 'Thu, 12 Jun 2025 15:00:00 +0900',
            'source': 'SBS',
            'link': 'http://example15.com',
            'description': '테크 뉴스를 요약했다.'
        },
        {
            'title': 'IT 업계 동향 (JTBC)',
            'published': 'Thu, 12 Jun 2025 16:00:00 +0900',
            'source': 'JTBC',
            'link': 'http://example16.com',
            'description': 'IT 업계 동향을 분석했다.'
        },
        {
            'title': 'IT 업계 동향 (YTN)',
            'published': 'Thu, 12 Jun 2025 16:00:00 +0900',
            'source': 'YTN',
            'link': 'http://example17.com',
            'description': 'IT 업계 동향을 분석했다.'
        },
        {
            'title': '스타트업 투자 소식 (노컷뉴스)',
            'published': 'Thu, 12 Jun 2025 17:00:00 +0900',
            'source': '노컷뉴스',
            'link': 'http://example18.com',
            'description': '스타트업 투자 소식이 전해졌다.'
        },
        {
            'title': '스타트업 투자 소식 (오마이뉴스)',
            'published': 'Thu, 12 Jun 2025 17:00:00 +0900',
            'source': '오마이뉴스',
            'link': 'http://example19.com',
            'description': '스타트업 투자 소식이 전해졌다.'
        },
        {
            'title': '벤처 기업 성장 (프레시안)',
            'published': 'Thu, 12 Jun 2025 18:00:00 +0900',
            'source': '프레시안',
            'link': 'http://example20.com',
            'description': '벤처 기업이 성장하고 있다.'
        },
        {
            'title': '벤처 기업 성장 (미디어오늘)',
            'published': 'Thu, 12 Jun 2025 18:00:00 +0900',
            'source': '미디어오늘',
            'link': 'http://example21.com',
            'description': '벤처 기업이 성장하고 있다.'
        },
        {
            'title': '일반적인 뉴스 제목 (테스트)',
            'published': 'Thu, 12 Jun 2025 19:00:00 +0900',
            'source': '테스트',
            'link': 'http://example22.com',
            'description': '일반적인 뉴스 내용이다.'
        },
        {
            'title': '일반적인 뉴스 제목 (테스트)',
            'published': 'Thu, 12 Jun 2025 19:00:00 +0900',
            'source': '테스트2',
            'link': 'http://example23.com',
            'description': '일반적인 뉴스 내용이다.'
        }
    ]
    
    print(f"테스트 뉴스 개수: {len(test_news)}")
    print("\n원본 뉴스 목록:")
    for i, news in enumerate(test_news, 1):
        print(f"{i:2d}. {news['title']} ({news['source']})")
    
    # 중복 제거 로직 테스트
    print("\n" + "="*80)
    print("중복 제거 로직 테스트:")
    print("="*80)
    
    seen_articles = {}
    unique_news = []
    duplicate_count = 0
    
    for i, news in enumerate(test_news):
        title = news.get('title', '').strip()
        published = news.get('published', '').strip()
        
        if title and published:
            normalized_title = news_service._normalize_title(title)
            normalized_date = news_service._normalize_date(published)
            article_key = (normalized_title, normalized_date)
            
            if article_key not in seen_articles:
                seen_articles[article_key] = i
                unique_news.append(news)
                print(f"✓ 보존: {normalized_title} ({normalized_date}) - {news['source']}")
            else:
                duplicate_count += 1
                print(f"✗ 제거: {normalized_title} ({normalized_date}) - {news['source']} (중복 #{duplicate_count})")
        else:
            unique_news.append(news)
            print(f"? 추가: {title[:50] if title else 'No title'}... (제목/날짜 없음)")
    
    print(f"\n결과 요약:")
    print(f"- 원본 뉴스: {len(test_news)}개")
    print(f"- 중복 제거: {duplicate_count}개")
    print(f"- 남은 뉴스: {len(unique_news)}개")
    
    print(f"\n최종 뉴스 목록:")
    for i, news in enumerate(unique_news, 1):
        normalized_title = news_service._normalize_title(news['title'])
        print(f"{i:2d}. {normalized_title} ({news['source']})")

if __name__ == "__main__":
    test_title_normalization()
    test_duplicate_removal()
