#!/usr/bin/env python3
"""
기업 데이터 마이그레이션 스크립트
기존 JavaScript의 companyData를 데이터베이스로 마이그레이션합니다.
"""

import sys
import os

# 프로젝트 루트를 Python 경로에 추가
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from app.models import db, Company

# 기존 기업 데이터
COMPANY_DATA = [
    # 2024년 기업들
    {'year': 2024, 'name': '크립토랩'},
    {'year': 2024, 'name': '올림플래닛'},
    {'year': 2024, 'name': '넷록스'},
    {'year': 2024, 'name': '페어리'},
    {'year': 2024, 'name': '논스랩'},
    {'year': 2024, 'name': '에스투더블유'},
    {'year': 2024, 'name': '스토익엔터테인먼트'},
    {'year': 2024, 'name': '센스톤'},
    {'year': 2024, 'name': '기원테크'},
    {'year': 2024, 'name': '지이모션'},
    {'year': 2024, 'name': '쿼리파이'},
    {'year': 2024, 'name': '프라젠'},
    {'year': 2024, 'name': '케이포시큐리티'},
    {'year': 2024, 'name': '아이씨티케이'},
    {'year': 2024, 'name': '지크립토'},
    {'year': 2024, 'name': '오내피플'},
    {'year': 2024, 'name': '큐비트시큐리티'},
    {'year': 2024, 'name': '아스트론시큐리티'},
    {'year': 2024, 'name': '올링크'},
    {'year': 2024, 'name': '디사일로'},
    {'year': 2024, 'name': '프라이빗테크놀로지'},
    # 2025년 기업들
    {'year': 2025, 'name': '에이아이스페라'},
    {'year': 2025, 'name': '이랑텍'},
    {'year': 2025, 'name': '옥타코'},
    {'year': 2025, 'name': '아타드'},
    {'year': 2025, 'name': '위닝아이'},
    {'year': 2025, 'name': '휴라'},
    {'year': 2025, 'name': '별따러가자'},
    {'year': 2025, 'name': '소프트프릭'},
    {'year': 2025, 'name': '알파카엑스'},
    {'year': 2025, 'name': '펀블'},
    {'year': 2025, 'name': '에스프레스토'},
    {'year': 2025, 'name': '소프트제국'},
    {'year': 2025, 'name': '쿼드마이너'},
    {'year': 2025, 'name': '와탭랩스'},
    {'year': 2025, 'name': '유락'},
    {'year': 2025, 'name': '파인더갭'},
    {'year': 2025, 'name': '고스트패스'},
    {'year': 2025, 'name': '시큐어링크'},
    {'year': 2025, 'name': '테이텀'},
    {'year': 2025, 'name': '큐빅'}
]

def migrate_companies():
    """기업 데이터를 데이터베이스로 마이그레이션"""
    app = create_app()
    
    with app.app_context():
        print("=" * 60)
        print("기업 데이터 마이그레이션 시작")
        print("=" * 60)
        
        # 기존 데이터 확인
        existing_count = Company.query.count()
        print(f"\n현재 데이터베이스에 등록된 기업 수: {existing_count}")
        
        if existing_count > 0:
            response = input("\n기존 데이터가 있습니다. 계속하시겠습니까? (y/n): ")
            if response.lower() != 'y':
                print("마이그레이션이 취소되었습니다.")
                return
        
        added_count = 0
        skipped_count = 0
        error_count = 0
        
        for idx, company_data in enumerate(COMPANY_DATA, 1):
            name = company_data['name']
            year = company_data['year']
            
            try:
                # 중복 체크
                existing = Company.query.filter_by(name=name, year=year).first()
                
                if existing:
                    if existing.is_active:
                        print(f"[{idx}/{len(COMPANY_DATA)}] SKIP: {name} ({year}) - 이미 존재함")
                        skipped_count += 1
                    else:
                        # 비활성 기업 재활성화
                        existing.is_active = True
                        db.session.commit()
                        print(f"[{idx}/{len(COMPANY_DATA)}] REACTIVATE: {name} ({year})")
                        added_count += 1
                else:
                    # 새 기업 추가
                    new_company = Company(
                        name=name,
                        year=year,
                        display_order=idx,
                        is_active=True
                    )
                    db.session.add(new_company)
                    db.session.commit()
                    print(f"[{idx}/{len(COMPANY_DATA)}] ADD: {name} ({year})")
                    added_count += 1
                    
            except Exception as e:
                db.session.rollback()
                print(f"[{idx}/{len(COMPANY_DATA)}] ERROR: {name} ({year}) - {str(e)}")
                error_count += 1
        
        print("\n" + "=" * 60)
        print("마이그레이션 완료")
        print("=" * 60)
        print(f"추가/재활성화: {added_count}개")
        print(f"건너뜀: {skipped_count}개")
        print(f"오류: {error_count}개")
        print(f"총 처리: {len(COMPANY_DATA)}개")
        
        # 최종 통계
        total_companies = Company.query.filter_by(is_active=True).count()
        companies_by_year = db.session.query(
            Company.year, 
            db.func.count(Company.id)
        ).filter_by(is_active=True).group_by(Company.year).order_by(Company.year).all()
        
        print("\n[연도별 기업 수]")
        for year, count in companies_by_year:
            print(f"  {year}년: {count}개")
        print(f"\n총 활성 기업 수: {total_companies}개")
        print("=" * 60)

if __name__ == '__main__':
    migrate_companies()
