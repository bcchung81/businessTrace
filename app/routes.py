from flask import Blueprint, render_template, request, jsonify, Response, send_file, session, redirect, url_for, flash
from .news_service import NewsService
from .news_analyzer import NewsAnalyzer
from .models import db, User, Archive, Company
from .email_service import EmailService
import json
import os
from datetime import datetime
import pytz
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill
from openpyxl.utils import get_column_letter
import tempfile
import secrets
import string
import traceback
import threading

main = Blueprint('main', __name__)

# 인증 관련 유틸리티 함수
def login_required(f):
    """로그인 필요 데코레이터"""
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({"error": "로그인이 필요합니다."}), 401
        return f(*args, **kwargs)
    decorated_function.__name__ = f.__name__
    return decorated_function

def generate_temp_password():
    """임시 비밀번호 생성"""
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for i in range(12))

# 뉴스 서비스 인스턴스 생성
news_service = NewsService()

@main.route("/")
def index():
    """메인 페이지 - 로그인 필요"""
    if 'user_id' not in session:
        return redirect(url_for('main.auth_login'))
    return render_template("index.html")

@main.route("/api/settings", methods=["GET"])
@login_required
def api_get_settings():
    """브라우저 기반 설정 API - 기본값만 반환"""
    default_settings = {
        "auto_refresh_interval": 300,  # 5분 (초 단위)
        "items_per_page": 15,
        "search_results_limit": 100,
        "google_news_enabled": True,
        "naver_news_enabled": True,
        "rss_sources_enabled": True
    }
    return jsonify(default_settings)

@main.route('/api/news')
@login_required
def api_news():
    """최신 뉴스 조회"""
    try:
        news_items = news_service.get_latest_news()
        return jsonify(news_items)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@main.route('/api/news/all')
@login_required
def api_all_news():
    """모든 뉴스를 가져오는 API"""
    news = news_service.get_latest_news()
    return jsonify(news)

@main.route('/api/news/period')
@login_required
def api_news_period():
    """기간별 뉴스 조회"""
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        limit = request.args.get('limit')
        if limit:
            limit = int(limit)
        
        results = news_service.get_news_by_period(start_date, end_date, limit)
        
        return jsonify({
            "results": results,
            "count": len(results),
            "start_date": start_date,
            "end_date": end_date
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@main.route('/api/search')
@login_required
def api_search():
    """뉴스 검색"""
    try:
        query = request.args.get('q', '')
        condition = request.args.get('condition', 'exact')
        
        # 검색 소스 설정
        naver_enabled = request.args.get('naver', 'true').lower() == 'true'
        google_enabled = request.args.get('google', 'true').lower() == 'true'
        
        # 중복도율 설정 (기본값 50%)
        duplicate_threshold = float(request.args.get('duplicate_threshold', '50')) / 100.0
        
        # 네이버 필터링 설정 (기본값 True)
        naver_title_filter = request.args.get('naver_title_filter', 'true').lower() == 'true'
        
        search_result = news_service.search_news(
            query=query,
            condition=condition,
            naver_enabled=naver_enabled,
            google_enabled=google_enabled,
            duplicate_threshold=duplicate_threshold,
            naver_title_filter=naver_title_filter
        )
        
        # 새로운 반환 형식 처리
        print(f"[DEBUG] search_result 타입: {type(search_result)}")
        print(f"[DEBUG] search_result 내용: {search_result}")
        
        if isinstance(search_result, dict):
            # 중복 제거 정보가 포함된 새로운 형식
            response_data = {
                "results": search_result['news'],
                "count": search_result['total_after_dedup'],
                "total_before_dedup": search_result['total_before_dedup'],
                "duplicates_removed": search_result['duplicates_removed'],
                "total_after_dedup": search_result['total_after_dedup'],
                "period_filtered": search_result.get('period_filtered', 0),
                "query": query
            }
            print(f"[DEBUG] 응답 데이터: {response_data}")
            return jsonify(response_data)
        else:
            # 기존 형식 (하위 호환성)
            response_data = {
                "results": search_result,
                "count": len(search_result),
                "query": query
            }
            print(f"[DEBUG] 기존 형식 응답 데이터: {response_data}")
            return jsonify(response_data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@main.route('/api/search/period')
def api_search_period():
    """기간별 뉴스 검색"""
    try:
        query = request.args.get('q', '')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        condition = request.args.get('condition', 'exact')
        limit = request.args.get('limit')
        if limit:
            limit = int(limit)
        else:
            limit = None  # 제한 없음
        
        # 검색 소스 설정
        naver_enabled = request.args.get('naver', 'true').lower() == 'true'
        google_enabled = request.args.get('google', 'true').lower() == 'true'
        
        # 중복도율 설정 (기본값 50%)
        duplicate_threshold = float(request.args.get('duplicate_threshold', '50')) / 100.0
        
        # 네이버 필터링 설정 (기본값 True)
        naver_title_filter = request.args.get('naver_title_filter', 'true').lower() == 'true'
        
        results = news_service.search_news_by_period(
            query=query,
            start_date=start_date,
            end_date=end_date,
            limit=limit,
            condition=condition,
            naver_enabled=naver_enabled,
            google_enabled=google_enabled,
            duplicate_threshold=duplicate_threshold,
            naver_title_filter=naver_title_filter
        )
        
        # search_news_by_period가 딕셔너리를 반환하는 경우
        if isinstance(results, dict):
            return jsonify({
                "results": results['news'],
                "count": results['total_after_dedup'],
                "total_before_dedup": results['total_before_dedup'],
                "duplicates_removed": results['duplicates_removed'],
                "total_after_dedup": results['total_after_dedup'],
                "period_filtered": results.get('period_filtered', 0),
                "query": query,
                "start_date": start_date,
                "end_date": end_date
            })
        else:
            # 기존 형식 (하위 호환성)
            return jsonify({
                "results": results,
                "count": len(results),
                "query": query,
                "start_date": start_date,
                "end_date": end_date
            })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@main.route('/api/search/download', methods=['GET', 'POST'])
@login_required
def api_search_download():
    """뉴스 검색 결과를 엑셀로 다운로드"""
    try:
        # POST 요청인 경우 (프론트엔드에서 검색 결과 데이터 전송)
        if request.method == 'POST':
            data = request.get_json()
            if not data:
                return jsonify({"error": "데이터가 필요합니다"}), 400
            
            query = data.get('query', '')
            news_results = data.get('results', [])
            
            if not query:
                return jsonify({"error": "검색어가 필요합니다"}), 400
            
            if not news_results:
                return jsonify({"error": "검색 결과가 없습니다"}), 400
            
            print(f"[DEBUG] 엑셀 다운로드 시작 - 뉴스 개수: {len(news_results)}")
            
            # 전체 본문 가져오기
            print(f"[DEBUG] 전체 본문 가져오기 시작...")
            news_results = _fetch_full_content_for_news_list(news_results)
            print(f"[DEBUG] 전체 본문 가져오기 완료")
            
            # 엑셀 파일 생성
            excel_buffer = create_news_excel_file(query, news_results)
            
            # 파일명 생성
            import re
            now = datetime.now()
            timestamp = now.strftime('%Y%m%d_%H%M')
            company_name = re.sub(r'[^가-힣a-zA-Z0-9]', '', query)[:20] or '검색결과'
            filename = f"{company_name}_뉴스검색결과_{timestamp}.xlsx"
            
            # 파일 다운로드 응답
            return send_file(
                excel_buffer,
                as_attachment=True,
                download_name=filename,
                mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
        
        # GET 요청인 경우 (기존 방식)
        # 검색 파라미터 받기
        query = request.args.get('q', '')
        condition = request.args.get('condition', 'exact')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        # 검색 소스 설정
        naver_enabled = request.args.get('naver', 'true').lower() == 'true'
        google_enabled = request.args.get('google', 'true').lower() == 'true'
        
        # 중복도율 설정 (기본값 50%)
        duplicate_threshold = float(request.args.get('duplicate_threshold', '50')) / 100.0
        
        # 네이버 필터링 설정 (기본값 True)
        naver_title_filter = request.args.get('naver_title_filter', 'true').lower() == 'true'
        
        if not query:
            return jsonify({"error": "검색어를 입력해주세요"}), 400
        
        # 뉴스 검색 실행
        if start_date and end_date:
            search_result = news_service.search_news_by_period(
                query=query,
                start_date=start_date,
                end_date=end_date,
                condition=condition,
                naver_enabled=naver_enabled,
                google_enabled=google_enabled,
                duplicate_threshold=duplicate_threshold,
                naver_title_filter=naver_title_filter
            )
        else:
            search_result = news_service.search_news(
                query=query,
                condition=condition,
                naver_enabled=naver_enabled,
                google_enabled=google_enabled,
                duplicate_threshold=duplicate_threshold,
                naver_title_filter=naver_title_filter
            )
        
        # 검색 결과 처리
        if isinstance(search_result, dict) and 'results' in search_result:
            news_items = search_result['results']
        elif isinstance(search_result, list):
            news_items = search_result
        else:
            news_items = []
        
        if not news_items:
            return jsonify({"error": "검색 결과가 없습니다"}), 404
        
        # 엑셀 파일 생성
        wb = Workbook()
        ws = wb.active
        ws.title = "뉴스검색결과"
        
        # 헤더 스타일 설정
        header_font = Font(bold=True, color="FFFFFF")
        header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
        header_alignment = Alignment(horizontal="center", vertical="center")
        
        # 컬럼 헤더 설정
        headers = ["분석소스", "뉴스제목", "뉴스내용", "출처", "링크"]
        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_alignment
        
        # 데이터 입력
        for row, item in enumerate(news_items, 2):
            # 분석소스 결정
            source = item.get('source', '')
            if 'naver' in source.lower():
                analysis_source = "네이버뉴스"
            elif 'google' in source.lower():
                analysis_source = "구글뉴스"
            else:
                analysis_source = "RSS"
            
            # 뉴스 내용 추출 (description이 비어있으면 title 사용)
            description = item.get('description', '')
            if not description or description.strip() == '':
                description = item.get('title', '')
            
            ws.cell(row=row, column=1, value=analysis_source)
            ws.cell(row=row, column=2, value=item.get('title', ''))
            ws.cell(row=row, column=3, value=description)
            ws.cell(row=row, column=4, value=item.get('press', item.get('source', '')))
            ws.cell(row=row, column=5, value=item.get('link', ''))
        
        # 컬럼 너비 자동 조정
        for col in range(1, len(headers) + 1):
            column_letter = get_column_letter(col)
            if col == 1:  # 분석소스 컬럼
                ws.column_dimensions[column_letter].width = 15
            elif col == 2:  # 뉴스제목 컬럼
                ws.column_dimensions[column_letter].width = 50
            elif col == 3:  # 뉴스내용 컬럼
                ws.column_dimensions[column_letter].width = 60
            elif col == 4:  # 출처 컬럼
                ws.column_dimensions[column_letter].width = 20
            elif col == 5:  # 링크 컬럼
                ws.column_dimensions[column_letter].width = 30
        
        # 파일명 생성 (기업명_뉴스검색결과_날짜시간.xlsx)
        kst = pytz.timezone('Asia/Seoul')
        now = datetime.now(kst)
        timestamp = now.strftime('%Y%m%d_%H%M')
        
        # 기업명이 검색어에 포함되어 있다면 사용, 아니면 검색어 사용
        company_name = query.replace(' ', '').replace('/', '_').replace('\\', '_')[:20]  # 파일명 안전성을 위해 제한
        filename = f"{company_name}_뉴스검색결과_{timestamp}.xlsx"
        
        # 임시 파일 생성
        temp_dir = tempfile.gettempdir()
        temp_path = os.path.join(temp_dir, filename)
        wb.save(temp_path)
        
        # 파일 다운로드 응답
        return send_file(
            temp_path,
            as_attachment=True,
            download_name=filename,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        
    except Exception as e:
        import traceback
        print(f"[ERROR] 엑셀 다운로드 오류: {str(e)}")
        print(f"[ERROR] 엑셀 다운로드 오류 상세: {traceback.format_exc()}")
        return jsonify({"error": f"엑셀 파일 생성 중 오류가 발생했습니다: {str(e)}"}), 500

@main.route('/api/analyze/all')
@login_required
def api_analyze_all():
    """통합 분석 API - 동향분석, 수상실적, 투자실적을 모두 수행 (스트리밍)"""
    company_name = request.args.get("company", "")
    query = request.args.get("query", company_name)
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    ai_model = request.args.get("ai_model", "gpt-4o-mini")  # AI 모델 설정 추가
    temperature = float(request.args.get("temperature", "0.3"))  # Temperature 설정 추가
    
    if not company_name:
        return jsonify({"error": "회사명을 입력해주세요"}), 400
    
    def generate():
        try:
            # 진행 상황 전송 시작
            yield f"data: {json.dumps({'type': 'progress', 'message': '뉴스 검색을 시작합니다...', 'progress': 0}, ensure_ascii=False)}\n\n"
            
            # 기간 설정이 있으면 기간별 검색, 없으면 일반 검색
            if start_date and end_date:
                yield f"data: {json.dumps({'type': 'progress', 'message': f'기간별 뉴스 검색 중... ({start_date} ~ {end_date})', 'progress': 0}, ensure_ascii=False)}\n\n"
                news_items = news_service.search_news_by_period(
                    query=query,
                    start_date=start_date,
                    end_date=end_date
                )
            else:
                yield f"data: {json.dumps({'type': 'progress', 'message': '뉴스 검색 중...', 'progress': 0}, ensure_ascii=False)}\n\n"
                news_items = news_service.search_news(query)
            
            yield f"data: {json.dumps({'type': 'progress', 'message': f'{len(news_items)}개의 뉴스를 발견했습니다. 분석을 시작합니다...', 'progress': 0}, ensure_ascii=False)}\n\n"
            
            # AI 모델 설정으로 분석기 생성 및 스트리밍 분석 실행
            analyzer = NewsAnalyzer(ai_model, temperature)
            analysis_generator = analyzer.analyze_news_comprehensive_streaming(
                company_name, 
                news_items
            )
            
            # 제너레이터에서 진행 상황과 최종 결과를 받아서 전송
            analysis_result = None
            print(f"[DEBUG] 분석 제너레이터 시작: {company_name}")
            
            for item in analysis_generator:
                print(f"[DEBUG] 제너레이터 아이템 타입: {type(item)}, 내용: {str(item)[:100]}...")
                
                if isinstance(item, str):
                    # 진행 상황 메시지
                    print(f"[DEBUG] 진행 상황 메시지: {item[:100]}...")
                    yield item
                else:
                    # 최종 결과
                    print(f"[DEBUG] 최종 결과 받음: {type(item)}")
                    print(f"[DEBUG] 최종 결과 키들: {list(item.keys()) if isinstance(item, dict) else 'Not a dict'}")
                    
                    # 최종 결과 검증
                    if isinstance(item, dict) and item.get('success'):
                        print(f"[DEBUG] ===== 최종 결과 상세 검증 =====")
                        print(f"[DEBUG] - success: {item.get('success')}")
                        print(f"[DEBUG] - company_name: {item.get('company_name')}")
                        print(f"[DEBUG] - analyzed_news 타입: {type(item.get('analyzed_news'))}")
                        print(f"[DEBUG] - analyzed_news 길이: {len(item.get('analyzed_news', []))}")
                        print(f"[DEBUG] - comprehensive_opinion 타입: {type(item.get('comprehensive_opinion'))}")
                        print(f"[DEBUG] - comprehensive_opinion 길이: {len(item.get('comprehensive_opinion', ''))}")
                        
                        # analyzed_news 검증
                        analyzed_news = item.get('analyzed_news', [])
                        if analyzed_news and len(analyzed_news) > 0:
                            print(f"[DEBUG] - 첫 번째 뉴스 타입: {type(analyzed_news[0])}")
                            if isinstance(analyzed_news[0], dict):
                                print(f"[DEBUG] - 첫 번째 뉴스 키들: {list(analyzed_news[0].keys())}")
                                required_keys = ['news_info', 'trend_analysis', 'award_analysis', 'investment_analysis']
                                missing_keys = [key for key in required_keys if key not in analyzed_news[0]]
                                if missing_keys:
                                    print(f"[DEBUG] - 경고: 첫 번째 뉴스에 필수 키 누락: {missing_keys}")
                        
                        print(f"[DEBUG] ===== 최종 결과 상세 검증 완료 =====")
                    
                    analysis_result = item
                    break
            
            # 최종 결과 전송
            print(f"[DEBUG] 최종 결과 전송 시작: analysis_result = {analysis_result is not None}")
            
            if analysis_result and analysis_result.get('success'):
                print(f"[DEBUG] ===== 분석 결과 유효성 확인 시작 =====")
                print(f"[DEBUG] - success: {analysis_result.get('success')}")
                print(f"[DEBUG] - company_name: {analysis_result.get('company_name')}")
                print(f"[DEBUG] - analyzed_news 개수: {len(analysis_result.get('analyzed_news', []))}")
                print(f"[DEBUG] - comprehensive_opinion 길이: {len(analysis_result.get('comprehensive_opinion', ''))}")
                print(f"[DEBUG] - analysis_result 타입: {type(analysis_result)}")
                print(f"[DEBUG] - analysis_result 키들: {list(analysis_result.keys())}")
                print(f"[DEBUG] ===== 분석 결과 유효성 확인 완료 =====")
                
                # 엑셀 저장 단계 진행 정보 전송
                excel_save_progress = {
                    'type': 'progress', 
                    'company_name': company_name, 
                    'total_news': len(analysis_result.get('analyzed_news', [])), 
                    'current_news': len(analysis_result.get('analyzed_news', [])), 
                    'current_step': '엑셀 저장', 
                    'message': f'{company_name} 분석결과를 엑셀로 저장하고 있습니다.', 
                    'progress': 95
                }
                print(f"[DEBUG] 엑셀 저장 단계 진행 정보 전송: {excel_save_progress}")
                yield f"data: {json.dumps(excel_save_progress, ensure_ascii=False, separators=(',', ':'))}\n\n"
                
                # 자동저장 실행 (백엔드에서 먼저 수행)
                try:
                    print(f"[DEBUG] ===== 백엔드 엑셀 자동저장 시작 =====")
                    print(f"[DEBUG] company_name: {company_name}")
                    print(f"[DEBUG] analyzed_news 개수: {len(analysis_result.get('analyzed_news', []))}")
                    print(f"[DEBUG] comprehensive_opinion 길이: {len(analysis_result.get('comprehensive_opinion', ''))}")
                    print(f"[DEBUG] start_date: {start_date}")
                    print(f"[DEBUG] end_date: {end_date}")
                    print(f"[DEBUG] 현재 세션 정보: {dict(session)}")
                    
                    # 사용자 정보 가져오기
                    current_user_id = session.get('user_id')
                    current_user_email = session.get('user_email', '')
                    print(f"[DEBUG] 현재 사용자 정보 - user_id: {current_user_id}, user_email: {current_user_email}")
                    
                    # 분석 결과 데이터 검증 강화
                    analyzed_news = analysis_result.get('analyzed_news', [])
                    comprehensive_opinion = analysis_result.get('comprehensive_opinion', '')
                    
                    print(f"[DEBUG] 데이터 검증:")
                    print(f"[DEBUG] - analyzed_news 타입: {type(analyzed_news)}")
                    print(f"[DEBUG] - analyzed_news 길이: {len(analyzed_news) if analyzed_news else 0}")
                    print(f"[DEBUG] - comprehensive_opinion 타입: {type(comprehensive_opinion)}")
                    print(f"[DEBUG] - comprehensive_opinion 길이: {len(comprehensive_opinion) if comprehensive_opinion else 0}")
                    
                    # analyzed_news가 리스트가 아니면 변환 시도
                    if analyzed_news and not isinstance(analyzed_news, list):
                        print(f"[DEBUG] analyzed_news가 리스트가 아님, 변환 시도...")
                        if isinstance(analyzed_news, dict):
                            analyzed_news = [analyzed_news]
                        else:
                            analyzed_news = []
                        print(f"[DEBUG] 변환 후 analyzed_news 길이: {len(analyzed_news)}")
                    
                    # comprehensive_opinion이 없으면 기본값 설정
                    if not comprehensive_opinion:
                        comprehensive_opinion = f"{company_name}에 대한 AI 분석이 완료되었습니다."
                        print(f"[DEBUG] comprehensive_opinion이 없어서 기본값 설정")
                    
                    # 자동저장 함수 호출 전 데이터 검증
                    if not current_user_id:
                        print(f"[DEBUG] 오류: 사용자 ID가 없어서 자동저장을 건너뜁니다.")
                        excel_save_message = f'{company_name} 분석결과 저장 중 사용자 정보 오류가 발생했습니다.'
                    elif not analyzed_news or len(analyzed_news) == 0:
                        print(f"[DEBUG] 오류: 분석된 뉴스가 없어서 자동저장을 건너뜁니다.")
                        excel_save_message = f'{company_name} 분석결과 저장 중 분석 데이터 오류가 발생했습니다.'
                    else:
                        print(f"[DEBUG] 자동저장 함수 호출 시작")
                        print(f"[DEBUG] 전달할 데이터:")
                        print(f"[DEBUG] - company_name: {company_name}")
                        print(f"[DEBUG] - analyzed_news 길이: {len(analyzed_news)}")
                        print(f"[DEBUG] - comprehensive_opinion 길이: {len(comprehensive_opinion)}")
                        print(f"[DEBUG] - start_date: {start_date}")
                        print(f"[DEBUG] - end_date: {end_date}")
                        print(f"[DEBUG] - current_user_id: {current_user_id}")
                        print(f"[DEBUG] - current_user_email: {current_user_email}")
                        
                        # 자동저장 함수 호출 전 최종 확인
                        print(f"[DEBUG] ===== 자동저장 함수 호출 직전 최종 확인 =====")
                        print(f"[DEBUG] analyzed_news 타입: {type(analyzed_news)}")
                        print(f"[DEBUG] analyzed_news 길이: {len(analyzed_news)}")
                        if analyzed_news and len(analyzed_news) > 0:
                            print(f"[DEBUG] 첫 번째 뉴스 타입: {type(analyzed_news[0])}")
                            print(f"[DEBUG] 첫 번째 뉴스 키들: {list(analyzed_news[0].keys()) if isinstance(analyzed_news[0], dict) else 'Not a dict'}")
                        print(f"[DEBUG] comprehensive_opinion 타입: {type(comprehensive_opinion)}")
                        print(f"[DEBUG] comprehensive_opinion 내용 (처음 100자): {comprehensive_opinion[:100] if comprehensive_opinion else 'None'}")
                        print(f"[DEBUG] ===== 자동저장 함수 호출 직전 최종 확인 완료 =====")
                        
                        try:
                            auto_save_result = auto_save_to_archive(
                                company_name, 
                                analyzed_news, 
                                comprehensive_opinion,
                                start_date, 
                                end_date,
                                current_user_id,
                                current_user_email
                            )
                            print(f"[DEBUG] 자동저장 함수 호출 완료, 결과: {auto_save_result}")
                        except Exception as call_error:
                            print(f"[DEBUG] 자동저장 함수 호출 중 예외 발생: {str(call_error)}")
                            import traceback
                            print(f"[DEBUG] 자동저장 함수 호출 예외 상세: {traceback.format_exc()}")
                            auto_save_result = False
                        print(f"[DEBUG] 백엔드 엑셀 자동저장 완료: {auto_save_result}")
                        
                        if auto_save_result:
                            print(f"[DEBUG] 공개자료실 자동저장 성공")
                            excel_save_message = f'{company_name} 분석결과가 공개자료실에 성공적으로 저장되었습니다.'
                        else:
                            print(f"[DEBUG] 공개자료실 자동저장 실패 - 백업 자동저장 시도")
                            excel_save_message = f'{company_name} 분석결과 저장 중 오류가 발생했습니다.'
                            
                            # 백업 자동저장 시도
                            try:
                                print(f"[DEBUG] 백업 자동저장 시작...")
                                backup_result = auto_save_to_archive(
                                    company_name, 
                                    analyzed_news, 
                                    comprehensive_opinion,
                                    start_date, 
                                    end_date,
                                    "backup_user",
                                    "backup@example.com"
                                )
                                if backup_result:
                                    print(f"[DEBUG] 백업 자동저장 성공")
                                    excel_save_message = f'{company_name} 분석결과가 백업으로 저장되었습니다.'
                                else:
                                    print(f"[DEBUG] 백업 자동저장도 실패")
                            except Exception as backup_error:
                                print(f"[DEBUG] 백업 자동저장 실패: {str(backup_error)}")
                        
                except Exception as e:
                    print(f"[DEBUG] 백엔드 엑셀 자동저장 실패: {str(e)}")
                    import traceback
                    print(f"[DEBUG] 백엔드 엑셀 자동저장 오류 상세: {traceback.format_exc()}")
                    excel_save_message = f'{company_name} 분석결과 저장 중 오류가 발생했습니다.'
                
                # 엑셀 저장 완료 진행 정보 전송
                excel_complete_progress = {
                    'type': 'progress', 
                    'company_name': company_name, 
                    'total_news': len(analysis_result.get('analyzed_news', [])), 
                    'current_news': len(analysis_result.get('analyzed_news', [])), 
                    'current_step': '분석 완료', 
                    'message': excel_save_message, 
                    'progress': 100
                }
                print(f"[DEBUG] 엑셀 저장 완료 진행 정보 전송: {excel_complete_progress}")
                yield f"data: {json.dumps(excel_complete_progress, ensure_ascii=False, separators=(',', ':'))}\n\n"
                
                # 완료 메시지 전송 (data 필드에 분석 결과 포함)
                complete_message = {
                    'type': 'complete', 
                    'data': analysis_result,
                    'message': f'{company_name} 분석이 완료되었습니다!'
                }
                print(f"[DEBUG] 완료 메시지 전송: {complete_message['type']}")
                print(f"[DEBUG] 완료 메시지 데이터 키들: {list(complete_message['data'].keys()) if complete_message['data'] else 'No data'}")
                
                # JSON 직렬화 시 줄바꿈 제거 및 안전한 전송
                json_str = json.dumps(complete_message, ensure_ascii=False, separators=(',', ':'))
                yield f"data: {json_str}\n\n"
                print(f"[DEBUG] 완료 메시지 전송 완료 (길이: {len(json_str)} bytes)")
            else:
                print(f"[DEBUG] 분석 결과가 없거나 실패함 - 오류 메시지 전송")
                error_message = {
                    'type': 'error', 
                    'message': analysis_result.get('message', '분석 결과를 받지 못했습니다.') if analysis_result else '분석 결과를 받지 못했습니다.'
                }
                yield f"data: {json.dumps(error_message, ensure_ascii=False)}\n\n"
            
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': f'분석 중 오류가 발생했습니다: {str(e)}'}, ensure_ascii=False)}\n\n"
    
    response = Response(generate(), mimetype='text/event-stream')
    # 캐시 방지 헤더 추가
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    # 무한 타임아웃 설정 (긴 분석 작업을 위해)
    response.headers['X-Accel-Buffering'] = 'no'
    response.headers['Connection'] = 'keep-alive'
    return response

@main.route('/api/analyze/trends')
@login_required
def api_analyze_trends():
    """동향분석 API"""
    company_name = request.args.get("company", "")
    query = request.args.get("query", company_name)
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    ai_model = request.args.get("ai_model", "gpt-4o-mini")  # AI 모델 설정 추가
    
    if not company_name:
        return jsonify({"error": "회사명을 입력해주세요"}), 400
    
    try:
        # 기간 설정이 있으면 기간별 검색, 없으면 일반 검색
        if start_date and end_date:
            news_items = news_service.search_news_by_period(
                query=query,
                start_date=start_date,
                end_date=end_date
            )
        else:
            news_items = news_service.search_news(query)
        
        # AI 모델 설정으로 분석기 생성 및 동향분석
        analyzer = NewsAnalyzer(ai_model, temperature)
        analysis_result = analyzer.analyze_trends(company_name, news_items)
        
        response = jsonify(analysis_result)
        # 캐시 방지 헤더 추가
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response
        
    except Exception as e:
        response = jsonify({
            "success": False,
            "message": f"분석 중 오류가 발생했습니다: {str(e)}",
            "analysis_type": "trends"
        }), 500
        # 캐시 방지 헤더 추가
        response[0].headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response[0].headers['Pragma'] = 'no-cache'
        response[0].headers['Expires'] = '0'
        return response

@main.route('/api/analyze/awards')
@login_required
def api_analyze_awards():
    """수상실적 분석 API"""
    company_name = request.args.get("company", "")
    query = request.args.get("query", company_name)
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    ai_model = request.args.get("ai_model", "gpt-4o-mini")  # AI 모델 설정 추가
    
    if not company_name:
        return jsonify({"error": "회사명을 입력해주세요"}), 400
    
    try:
        # 기간 설정이 있으면 기간별 검색, 없으면 일반 검색
        if start_date and end_date:
            news_items = news_service.search_news_by_period(
                query=query,
                start_date=start_date,
                end_date=end_date
            )
        else:
            news_items = news_service.search_news(query)
        
        # AI 모델 설정으로 분석기 생성 및 수상실적 분석
        analyzer = NewsAnalyzer(ai_model, temperature)
        analysis_result = analyzer.analyze_awards(company_name, news_items)
        
        response = jsonify(analysis_result)
        # 캐시 방지 헤더 추가
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response
        
    except Exception as e:
        response = jsonify({
            "success": False,
            "message": f"분석 중 오류가 발생했습니다: {str(e)}",
            "analysis_type": "awards"
        }), 500
        # 캐시 방지 헤더 추가
        response[0].headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response[0].headers['Pragma'] = 'no-cache'
        response[0].headers['Expires'] = '0'
        return response

@main.route('/api/analyze/investment')
@login_required
def api_analyze_investment():
    """투자실적 분석 API"""
    company_name = request.args.get("company", "")
    query = request.args.get("query", company_name)
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    ai_model = request.args.get("ai_model", "gpt-4o-mini")  # AI 모델 설정 추가
    
    if not company_name:
        return jsonify({"error": "회사명을 입력해주세요"}), 400
    
    try:
        # 기간 설정이 있으면 기간별 검색, 없으면 일반 검색
        if start_date and end_date:
            news_items = news_service.search_news_by_period(
                query=query,
                start_date=start_date,
                end_date=end_date
            )
        else:
            news_items = news_service.search_news(query)
        
        # AI 모델 설정으로 분석기 생성 및 투자실적 분석
        analyzer = NewsAnalyzer(ai_model, temperature)
        analysis_result = analyzer.analyze_investment(company_name, news_items)
        
        response = jsonify(analysis_result)
        # 캐시 방지 헤더 추가
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response
        
    except Exception as e:
        response = jsonify({
            "success": False,
            "message": f"분석 중 오류가 발생했습니다: {str(e)}",
            "analysis_type": "investment"
        }), 500
        # 캐시 방지 헤더 추가
        response[0].headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response[0].headers['Pragma'] = 'no-cache'
        response[0].headers['Expires'] = '0'
        return response

@main.route('/api/analyze/direct', methods=['POST'])
@login_required
def api_analyze_direct():
    """검색된 뉴스 데이터를 직접 받아서 분석하는 API (스트리밍)"""
    print(f"[DEBUG] ===== api_analyze_direct 함수 시작 =====")
    try:
        data = request.get_json()
        company_name = data.get("company", "")
        ai_model = data.get("ai_model", "gpt-4o-mini")
        temperature = data.get("temperature", 0.3)
        news_data = data.get("news_data", [])
        
        if not company_name:
            return jsonify({"error": "회사명을 입력해주세요"}), 400
            
        if not news_data:
            return jsonify({"error": "분석할 뉴스 데이터가 없습니다"}), 400
            
        print(f"[DEBUG] 직접 분석 요청 - 회사: {company_name}, 뉴스 수: {len(news_data)}, AI 모델: {ai_model}")
        print(f"[DEBUG] 직접 분석 요청 - 현재 시간: {datetime.now()}")
        
        # 세션 정보를 미리 가져오기
        current_user_id = session.get('user_id')
        current_user_email = session.get('user_email', '')
        print(f"[DEBUG] 직접 분석 세션 정보 - user_id: {current_user_id}, user_email: {current_user_email}")
        print(f"[DEBUG] 직접 분석 세션 정보 - 세션 전체: {dict(session)}")
        print(f"[DEBUG] 직접 분석 세션 정보 - 세션 타입: {type(session)}")
        
        def generate():
            try:
                # AI 모델 설정으로 분석기 생성
                analyzer = NewsAnalyzer(ai_model, temperature)
                
                # 진행 상황 전송 시작
                yield f"data: {json.dumps({'type': 'progress', 'message': f'{len(news_data)}개의 뉴스 분석을 시작합니다...', 'progress': 0}, ensure_ascii=False)}\n\n"
                
                # 스트리밍 분석 실행
                analysis_generator = analyzer.analyze_news_comprehensive_streaming(
                    company_name, 
                    news_data
                )
                
                # 제너레이터에서 진행 상황과 최종 결과를 받아서 전송
                analysis_result = None
                for item in analysis_generator:
                    if isinstance(item, str):
                        # 진행 상황 메시지
                        yield item
                    else:
                        # 최종 결과
                        analysis_result = item
                        break
                
                # 최종 결과 전송
                if analysis_result:
                    print(f"[DEBUG] 최종 분석 결과 타입: {type(analysis_result)}")
                    print(f"[DEBUG] 최종 분석 결과 키들: {list(analysis_result.keys()) if isinstance(analysis_result, dict) else 'Not a dict'}")
                    
                    # 엑셀 저장 단계 진행 정보 전송
                    excel_save_progress = {'type': 'progress', 'company_name': company_name, 'total_news': len(analysis_result.get('analyzed_news', [])), 'current_news': len(analysis_result.get('analyzed_news', [])), 'current_step': '엑셀 저장', 'message': f'{company_name} 분석결과를 엑셀로 저장하고 있습니다.', 'progress': 95}
                    print(f"[DEBUG] 직접 분석 엑셀 저장 단계 진행 정보 전송: {excel_save_progress}")
                    yield f"data: {json.dumps(excel_save_progress, ensure_ascii=False, separators=(',', ':'))}\n\n"
                    
                    # 자동저장을 별도 스레드에서 실행
                    def auto_save_thread():
                        try:
                            print(f"[DEBUG] 별도 스레드에서 자동저장 시작")
                            
                            # Flask 애플리케이션 컨텍스트 생성
                            from app import create_app
                            app = create_app()
                            with app.app_context():
                                # 데이터 검증 및 변환
                                analyzed_news = analysis_result.get('analyzed_news', [])
                                comprehensive_opinion = analysis_result.get('comprehensive_opinion', '')
                                
                                print(f"[DEBUG] 별도 스레드 데이터 검증:")
                                print(f"[DEBUG] - analyzed_news 타입: {type(analyzed_news)}")
                                print(f"[DEBUG] - analyzed_news 길이: {len(analyzed_news) if analyzed_news else 0}")
                                print(f"[DEBUG] - comprehensive_opinion 타입: {type(comprehensive_opinion)}")
                                print(f"[DEBUG] - comprehensive_opinion 길이: {len(comprehensive_opinion) if comprehensive_opinion else 0}")
                                
                                # analyzed_news가 리스트가 아니면 변환 시도
                                if analyzed_news and not isinstance(analyzed_news, list):
                                    print(f"[DEBUG] analyzed_news가 리스트가 아님, 변환 시도...")
                                    if isinstance(analyzed_news, dict):
                                        analyzed_news = [analyzed_news]
                                    else:
                                        analyzed_news = []
                                    print(f"[DEBUG] 변환 후 analyzed_news 길이: {len(analyzed_news)}")
                                
                                # comprehensive_opinion이 없으면 기본값 설정
                                if not comprehensive_opinion:
                                    comprehensive_opinion = f"{company_name}에 대한 AI 분석이 완료되었습니다."
                                    print(f"[DEBUG] comprehensive_opinion이 없어서 기본값 설정")
                                
                                # 자동저장 함수 호출 전 최종 확인
                                print(f"[DEBUG] ===== 별도 스레드 자동저장 함수 호출 직전 최종 확인 =====")
                                print(f"[DEBUG] analyzed_news 타입: {type(analyzed_news)}")
                                print(f"[DEBUG] analyzed_news 길이: {len(analyzed_news)}")
                                if analyzed_news and len(analyzed_news) > 0:
                                    print(f"[DEBUG] 첫 번째 뉴스 타입: {type(analyzed_news[0])}")
                                    print(f"[DEBUG] 첫 번째 뉴스 키들: {list(analyzed_news[0].keys()) if isinstance(analyzed_news[0], dict) else 'Not a dict'}")
                                print(f"[DEBUG] comprehensive_opinion 타입: {type(comprehensive_opinion)}")
                                print(f"[DEBUG] comprehensive_opinion 내용 (처음 100자): {comprehensive_opinion[:100] if comprehensive_opinion else 'None'}")
                                print(f"[DEBUG] ===== 별도 스레드 자동저장 함수 호출 직전 최종 확인 완료 =====")
                                
                                try:
                                    auto_save_to_archive(
                                        company_name, 
                                        analyzed_news, 
                                        comprehensive_opinion,
                                        None, 
                                        None,
                                        current_user_id,
                                        current_user_email
                                    )
                                    print(f"[DEBUG] 별도 스레드 자동저장 함수 호출 완료")
                                except Exception as call_error:
                                    print(f"[DEBUG] 별도 스레드 자동저장 함수 호출 중 예외 발생: {str(call_error)}")
                                    import traceback
                                    print(f"[DEBUG] 별도 스레드 자동저장 함수 호출 예외 상세: {traceback.format_exc()}")
                            print(f"[DEBUG] 별도 스레드에서 자동저장 완료")
                        except Exception as e:
                            print(f"[DEBUG] 별도 스레드에서 자동저장 실패: {str(e)}")
                            import traceback
                            print(f"[DEBUG] 별도 스레드 자동저장 오류 상세: {traceback.format_exc()}")
                    
                    if current_user_id:
                        thread = threading.Thread(target=auto_save_thread)
                        thread.daemon = True
                        thread.start()
                        print(f"[DEBUG] 자동저장 스레드 시작됨")
                    else:
                        print(f"[DEBUG] 사용자 정보가 없어서 자동저장 스레드를 시작하지 않음")
                    
                    # 엑셀 저장 완료 진행 정보 전송
                    excel_complete_progress = {'type': 'progress', 'company_name': company_name, 'total_news': len(analysis_result.get('analyzed_news', [])), 'current_news': len(analysis_result.get('analyzed_news', [])), 'current_step': '분석 완료', 'message': f'{company_name} 분석이 완료되었습니다!', 'progress': 100}
                    print(f"[DEBUG] 직접 분석 엑셀 저장 완료 진행 정보 전송: {excel_complete_progress}")
                    yield f"data: {json.dumps(excel_complete_progress, ensure_ascii=False, separators=(',', ':'))}\n\n"
                    
                    # 완료 메시지 전송 - JSON 직렬화 시 줄바꿈 제거
                    complete_message = {'type': 'complete', 'result': analysis_result}
                    json_str = json.dumps(complete_message, ensure_ascii=False, separators=(',', ':'))
                    yield f"data: {json_str}\n\n"
                    print(f"[DEBUG] 직접 분석 완료 메시지 전송 완료 (길이: {len(json_str)} bytes)")
                else:
                    yield f"data: {json.dumps({'type': 'error', 'message': '분석 결과를 받을 수 없습니다.'}, ensure_ascii=False)}\n\n"
                
            except Exception as e:
                print(f"[ERROR] 직접 분석 오류: {str(e)}")
                yield f"data: {json.dumps({'type': 'error', 'message': f'분석 중 오류가 발생했습니다: {str(e)}'}, ensure_ascii=False)}\n\n"
        
        response = Response(generate(), mimetype='text/event-stream')
        # 캐시 방지 헤더 추가
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response
        
    except Exception as e:
        print(f"[ERROR] 직접 분석 API 오류: {str(e)}")
        return jsonify({"error": f"분석 요청 처리 중 오류가 발생했습니다: {str(e)}"}), 500

@main.route('/api/analyze/streaming')
@login_required
def api_analyze_streaming():
    """실시간 분석 스트리밍"""
    def generate():
        try:
            company_name = request.args.get("company", "")
            query = request.args.get("query", company_name)
            start_date = request.args.get("start_date")
            end_date = request.args.get("end_date")
            ai_model = request.args.get("ai_model", "gpt-4o-mini")  # AI 모델 설정 추가
            temperature = float(request.args.get("temperature", 0.3))  # Temperature 설정 추가
            
            if not company_name:
                yield f"data: {json.dumps({'error': '회사명을 입력해주세요'}, ensure_ascii=False)}\n\n"
                return
            
            # 뉴스 수집
            yield f"data: {json.dumps({'type': 'progress', 'message': '뉴스를 수집하고 있습니다...', 'progress': 10}, ensure_ascii=False)}\n\n"
            
            if start_date and end_date:
                news_items = news_service.search_news_by_period(
                    query=query,
                    start_date=start_date,
                    end_date=end_date
                )
            else:
                news_items = news_service.search_news(query)
            
            yield f"data: {json.dumps({'type': 'progress', 'message': f'{len(news_items)}개의 뉴스를 수집했습니다.', 'progress': 20}, ensure_ascii=False)}\n\n"
            
            # 수상실적 분석 시작
            yield f"data: {json.dumps({'type': 'progress', 'message': '수상실적 분석을 시작합니다...', 'progress': 30}, ensure_ascii=False)}\n\n"
            
            awards = []
            for i, news in enumerate(news_items):
                title = news.get('title', '')
                description = news.get('description', '')
                source = news.get('source', '')
                published = news.get('published', '')
                link = news.get('link', '')
                
                yield f"data: {json.dumps({'type': 'progress', 'message': f'뉴스 {i+1} 분석 중: {title[:30]}...', 'progress': 30 + (i * 2)}, ensure_ascii=False)}\n\n"
                
                # ChatGPT 스트리밍 응답
                news_text = f"""
뉴스 제목: {title}
뉴스 내용: {description}
출처: {source}
날짜: {published}
"""
                
                prompt = f"""
다음은 '{company_name}' 회사에 대한 뉴스입니다. 이 뉴스에서 수상 관련 정보를 찾아주세요.

분석 요구사항:
1. 수상 관련 뉴스인지 판단 (상, 시상, 수상, 어워드, award, prize 등)
2. 수상 관련이면 다음 정보 추출:
   - 수상 연도
   - 수상명
   - 수상 기관/대회명
   - 수상 이유나 성과

뉴스 내용:
{news_text}

반드시!!! 다음 JSON 형식으로 응답해주세요. 다른형식으로 응답하면 처리를 할수 없습니다.:
{{
    "is_award_related": true/false,
    "award_info": {{
        "year": "2023",
        "award_name": "수상명",
        "organization": "수상기관/대회명",
        "reason": "수상 이유"
    }}
}}

수상 관련이 아니면 "is_award_related": false로 응답해주세요.
"""
                
                try:
                    # AI 모델 설정으로 분석기 생성
                    analyzer = NewsAnalyzer(ai_model, temperature)
                    response = analyzer.client.chat.completions.create(
                        model=analyzer.model_name,
                        messages=[
                            {"role": "system", "content": "당신은 뉴스 분석 전문가입니다. 정확하고 객관적으로 뉴스를 분석해주세요."},
                            {"role": "user", "content": prompt}
                        ],
                        max_tokens=1000,
                        temperature=analyzer.temperature,
                        stream=True
                    )
                    
                    full_response = ""
                    for chunk in response:
                        if chunk.choices[0].delta.content:
                            content = chunk.choices[0].delta.content
                            full_response += content
                            # 실시간으로 ChatGPT 응답 전송
                            yield f"data: {json.dumps({'type': 'stream', 'content': content, 'news_index': i+1}, ensure_ascii=False)}\n\n"
                    
                    # 분석 결과 처리 - 강화된 JSON 파싱 사용
                    analyzer = NewsAnalyzer(ai_model, temperature)
                    result = analyzer._extract_and_parse_json(full_response, i+1)
                    if not result or not isinstance(result, dict):
                        yield f"data: {json.dumps({'type': 'error', 'message': f'뉴스 {i+1} JSON 파싱 실패'}, ensure_ascii=False)}\n\n"
                        continue
                    if result.get("is_award_related", False) and result.get("award_info"):
                        award_info = result["award_info"]
                        awards.append({
                            "year": award_info.get("year", ""),
                            "award_name": award_info.get("award_name", ""),
                            "organization": award_info.get("organization", ""),
                            "reason": award_info.get("reason", ""),
                            "news_title": title,
                            "news_link": link,
                            "news_source": source,
                            "news_date": published
                        })
                        yield f"data: {json.dumps({'type': 'result', 'message': '수상실적 발견: ' + award_info.get('award_name', ''), 'news_index': i+1}, ensure_ascii=False)}\n\n"
                    
                except Exception as e:
                    yield f"data: {json.dumps({'type': 'error', 'message': f'뉴스 {i+1} 분석 중 오류: {str(e)}'}, ensure_ascii=False)}\n\n"
                    continue
            
            # 최종 결과
            yield f"data: {json.dumps({'type': 'complete', 'awards': awards, 'total_awards': len(awards)}, ensure_ascii=False)}\n\n"
            
            # 분석 완료 시 공개자료실에 자동 저장
            # 분석 데이터 준비
            analyzed_news = []
            for i, news in enumerate(news_items):
                analyzed_news.append({
                    'news_info': {
                        'title': news.get('title', ''),
                        'description': news.get('description', ''),
                        'source': news.get('source', ''),
                        'published': news.get('published', ''),
                        'link': news.get('link', '')
                    },
                    'award_analysis': {
                        'is_award_related': 'Y' if i < len(awards) else 'N',
                        'award_name': awards[i].get('award_name', '') if i < len(awards) else '',
                        'award_reason': awards[i].get('reason', '') if i < len(awards) else ''
                    }
                })
            
            # 종합 의견 생성
            comprehensive_opinion = f"- 총 {len(news_items)}건의 뉴스에서 수상실적 분석을 하였습니다.\n- 수상실적은 {len(awards)}건으로 추정됩니다."
            
            # 공개자료실에 자동 저장
            try:
                current_user_id = session.get('user_id')
                current_user_email = session.get('user_email', '')
                auto_save_to_archive(company_name, analyzed_news, comprehensive_opinion, start_date, end_date, current_user_id, current_user_email)
            except Exception as e:
                print(f"공개자료실 자동 저장 중 오류: {str(e)}")
        
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': f'분석 중 오류가 발생했습니다: {str(e)}'}, ensure_ascii=False)}\n\n"
    
    response = Response(generate(), mimetype='text/event-stream')
    # 캐시 방지 헤더 추가
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@main.route('/api/search_old')
def api_search_news():
    """뉴스 검색 API (구버전 - 더이상 사용 안함)"""
    query = request.args.get("q", "")
    condition = request.args.get("condition", "exact")  # 검색 조건 추가
    if not query:
        return jsonify({"error": "검색어를 입력해주세요"}), 400
    
    # 개별 RSS 소스 설정 받기
    etnews_enabled = request.args.get("etnews", "true").lower() == "true"
    mk_enabled = request.args.get("mk", "true").lower() == "true"
    boan_enabled = request.args.get("boan", "true").lower() == "true"
    yonhap_enabled = request.args.get("yonhap", "true").lower() == "true"
    chosun_enabled = request.args.get("chosun", "true").lower() == "true"
    joongang_enabled = request.args.get("joongang", "true").lower() == "true"
    donga_enabled = request.args.get("donga", "true").lower() == "true"
    hankyoreh_enabled = request.args.get("hankyoreh", "true").lower() == "true"
    koreaherald_enabled = request.args.get("koreaherald", "true").lower() == "true"
    koreatimes_enabled = request.args.get("koreatimes", "true").lower() == "true"
    naver_enabled = request.args.get("naver", "true").lower() == "true"
    google_enabled = request.args.get("google", "true").lower() == "true"
    
    # 한글 검색어 처리
    original_query = query
    print(f"Original query received: '{original_query}' (type: {type(original_query)})")
    
    # URL 디코딩 처리
    try:
        from urllib.parse import unquote
        decoded_query = unquote(query)
        print(f"URL decoded query: '{decoded_query}'")
        query = decoded_query
    except Exception as e:
        print(f"URL decoding error: {e}")
    
    # 공백 제거 및 정규화
    query = query.strip()
    
    # 한글 인코딩 문제 해결 - 직접 처리
    try:
        # Latin-1로 인코딩된 한글을 UTF-8로 변환
        if query.startswith('ì¤') or query.startswith('í'):
            # Latin-1 인코딩된 한글을 UTF-8로 변환
            query_bytes = query.encode('latin-1')
            query = query_bytes.decode('utf-8')
            print(f"Fixed encoding: '{query}'")
    except Exception as e:
        print(f"Encoding fix error: {e}")
    
    print(f"Final search query: '{query}' (condition: {condition}, RSS: etnews={etnews_enabled}, mk={mk_enabled}, boan={boan_enabled}, yonhap={yonhap_enabled})")
    
    if not query:
        return jsonify({"error": "유효한 검색어를 입력해주세요"}), 400
    
    # 검색 조건에 따라 다른 메서드 호출
    if condition == "exact":
        # 전체일치 검색 (기존 방식)
        news = news_service.search_news(query, etnews_enabled=etnews_enabled, mk_enabled=mk_enabled, 
                                       boan_enabled=boan_enabled, yonhap_enabled=yonhap_enabled,
                                       chosun_enabled=chosun_enabled, joongang_enabled=joongang_enabled,
                                       donga_enabled=donga_enabled, hankyoreh_enabled=hankyoreh_enabled,
                                       koreaherald_enabled=koreaherald_enabled, koreatimes_enabled=koreatimes_enabled,
                                       naver_enabled=naver_enabled, google_enabled=google_enabled)
    elif condition == "and":
        # AND 검색 - 모든 키워드가 포함된 뉴스
        keywords = [kw.strip() for kw in query.split() if kw.strip()]
        news = news_service.search_news_and(keywords, etnews_enabled=etnews_enabled, mk_enabled=mk_enabled, 
                                           boan_enabled=boan_enabled, yonhap_enabled=yonhap_enabled,
                                           chosun_enabled=chosun_enabled, joongang_enabled=joongang_enabled,
                                           donga_enabled=donga_enabled, hankyoreh_enabled=hankyoreh_enabled,
                                           koreaherald_enabled=koreaherald_enabled, koreatimes_enabled=koreatimes_enabled,
                                           naver_enabled=naver_enabled, google_enabled=google_enabled)
    elif condition == "or":
        # OR 검색 - 키워드 중 하나라도 포함된 뉴스
        keywords = [kw.strip() for kw in query.split() if kw.strip()]
        news = news_service.search_news_or(keywords, etnews_enabled=etnews_enabled, mk_enabled=mk_enabled, 
                                          boan_enabled=boan_enabled, yonhap_enabled=yonhap_enabled,
                                          chosun_enabled=chosun_enabled, joongang_enabled=joongang_enabled,
                                          donga_enabled=donga_enabled, hankyoreh_enabled=hankyoreh_enabled,
                                          koreaherald_enabled=koreaherald_enabled, koreatimes_enabled=koreatimes_enabled,
                                          naver_enabled=naver_enabled, google_enabled=google_enabled)
    else:
        # 기본값으로 전체일치 검색
        news = news_service.search_news(query, etnews_enabled=etnews_enabled, mk_enabled=mk_enabled, 
                                       boan_enabled=boan_enabled, yonhap_enabled=yonhap_enabled,
                                       chosun_enabled=chosun_enabled, joongang_enabled=joongang_enabled,
                                       donga_enabled=donga_enabled, hankyoreh_enabled=hankyoreh_enabled,
                                       koreaherald_enabled=koreaherald_enabled, koreatimes_enabled=koreatimes_enabled,
                                       naver_enabled=naver_enabled, google_enabled=google_enabled)
    
    return jsonify({
        "query": query,
        "condition": condition,
        "results": news,
        "count": len(news)
    })

@main.route("/api/search/progress")
def api_search_progress():
    """검색 진행 상황 API"""
    return jsonify({
        "current_source": getattr(news_service, 'current_source', ''),
        "total_sources": getattr(news_service, 'total_sources', 0),
        "completed_sources": getattr(news_service, 'completed_sources', 0),
        "status": getattr(news_service, 'status', 'idle')
    })

# 알람 관련 API 엔드포인트들 제거
# @main.route("/api/alert/status", methods=["GET"])
# def api_alert_status():
#     """뉴스 알람 전체 상태 조회 API"""
#     status = session.get('news_alert_enabled', False)
#     # 페이지 접속 시간을 알람 시작 시간으로 사용
#     start_time = session.get('page_visit_time')
#     return jsonify({
#         "enabled": status,
#         "start_time": start_time
#     })

# @main.route("/api/alert/toggle", methods=["POST"])
# def api_alert_toggle():
#     """뉴스 알람 전체 동작 토글 API"""
#     current_status = session.get('news_alert_enabled', False)
#     new_status = not current_status
#     session['news_alert_enabled'] = new_status
    
#     # 알람을 켤 때 페이지 접속 시간을 시작 시간으로 설정
#     if new_status:
#         page_visit_time = session.get('page_visit_time')
#         if page_visit_time:
#             session['news_alert_start_time'] = page_visit_time
#         else:
#             # 페이지 접속 시간이 없으면 현재 시간을 사용 (fallback)
#             session['news_alert_start_time'] = datetime.now(pytz.UTC).isoformat()
    
#     return jsonify({"enabled": new_status})

# @main.route("/api/alert/keywords", methods=["GET"])
# def api_alert_keywords():
#     """알람 키워드 목록 조회 API"""
#     keywords = session.get('alert_keywords', [])
#     return jsonify(keywords)

# @main.route("/api/alert/keywords", methods=["POST"])
# def api_alert_keywords_save():
#     """알람 키워드 목록 저장 API"""
#     data = request.get_json()
#     keywords = data.get('keywords', [])
#     session['alert_keywords'] = keywords
#     return jsonify({"success": True, "keywords": keywords})

# @main.route("/api/alert/check/<keyword>")
# def api_alert_check_keyword(keyword):
#     """특정 키워드의 새로운 뉴스 확인 API"""
#     if not session.get('news_alert_enabled', False):
#         return jsonify({"new_news": [], "count": 0})
    
#     start_time = session.get('news_alert_start_time')
#     if not start_time:
#         return jsonify({"new_news": [], "count": 0})
    
#     # 개별 RSS 소스 설정 받기 (기본값은 모두 활성화)
#     etnews_enabled = request.args.get("etnews", "true").lower() == "true"
#     mk_enabled = request.args.get("mk", "true").lower() == "true"
#     boan_enabled = request.args.get("boan", "true").lower() == "true"
#     yonhap_enabled = request.args.get("yonhap", "true").lower() == "true"
    
#     try:
#         # UTC 시간으로 파싱 (timezone aware)
#         start_datetime = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
#         if start_datetime.tzinfo is None:
#             start_datetime = pytz.UTC.localize(start_datetime)
        
#         print(f"Alert check for '{keyword}': start_time = {start_datetime} (RSS: etnews={etnews_enabled}, mk={mk_enabled}, boan={boan_enabled}, yonhap={yonhap_enabled})")
        
#         news_items = news_service.search_news(keyword, etnews_enabled=etnews_enabled, mk_enabled=mk_enabled, boan_enabled=boan_enabled, yonhap_enabled=yonhap_enabled)
        
#         # 시작 시간 이후의 뉴스만 필터링
#         new_news = []
#         total_with_date = 0
#         for news in news_items:
#             try:
#                 # 뉴스 발행일을 파싱하여 비교
#                 if news.get('published'):
#                     news_date = news_service.parse_date(news['published'])
#                     if news_date is not None:  # 날짜 파싱이 성공한 경우만
#                         total_with_date += 1
#                         # 둘 다 timezone-aware 상태에서 비교
#                         if news_date > start_datetime:
#                             new_news.append(news)
#                             print(f"NEW NEWS FOUND: {news.get('title', '')[:50]}... (published: {news_date}, start: {start_datetime})")
#             except Exception as e:
#                 print(f"Error parsing news date: {e}")
#                 continue
        
#         print(f"Alert check for '{keyword}': Found {len(new_news)} new items out of {len(news_items)} total items ({total_with_date} with valid dates)")
        
#         return jsonify({
#             "new_news": new_news[:100],  # 최대 100개로 변경
#             "count": len(new_news)
#         })
        
#     except Exception as e:
#         print(f"Error checking alerts for keyword '{keyword}': {e}")
#         return jsonify({"new_news": [], "count": 0})

# @main.route("/api/alert/check-all")
# def api_alert_check_all_keywords():
#     """모든 알람 키워드의 새로운 뉴스를 한번에 확인하는 API (통합 결과 반환)"""
#     if not session.get('news_alert_enabled', False):
#         return jsonify({
#             "enabled": False, 
#             "total_new_count": 0,
#             "total_old_count": 0,
#             "keywords_count": 0,
#             "combined_results": []
#         })
    
#     start_time = session.get('news_alert_start_time')
#     if not start_time:
#         return jsonify({
#             "enabled": True, 
#             "total_new_count": 0,
#             "total_old_count": 0,
#             "keywords_count": 0,
#             "combined_results": []
#         })
    
#     # 개별 RSS 소스 설정 받기 (기본값은 모두 활성화)
#     etnews_enabled = request.args.get("etnews", "true").lower() == "true"
#     mk_enabled = request.args.get("mk", "true").lower() == "true"
#     boan_enabled = request.args.get("boan", "true").lower() == "true"
#     yonhap_enabled = request.args.get("yonhap", "true").lower() == "true"
    
#     keywords = session.get('alert_keywords', [])
#     # enabled 속성 확인 제거 - 모든 키워드를 활성화된 것으로 처리
#     enabled_keywords = keywords
    
#     if not enabled_keywords:
#         return jsonify({
#             "enabled": True, 
#             "total_new_count": 0,
#             "total_old_count": 0,
#             "keywords_count": 0,
#             "combined_results": []
#         })
    
#     try:
#         # UTC 시간으로 파싱 (timezone aware)
#         start_datetime = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
#         if start_datetime.tzinfo is None:
#             start_datetime = pytz.UTC.localize(start_datetime)
        
#         # 모든 뉴스를 저장할 리스트
#         all_combined_news = []
#         processed_keywords = 0
        
#         # 각 키워드별로 순차적으로 검색하고 결과를 누적
#         for keyword_info in enabled_keywords:
#             keyword = keyword_info.get('keyword', '')
#             if not keyword:
#                 continue
                
#             print(f"Processing keyword ({processed_keywords + 1}/{len(enabled_keywords)}): {keyword}")
            
#             # UTC 시간으로 파싱된 start_datetime 로그 출력 (한 번만)
#             if processed_keywords == 0:
#                 print(f"Alert check-all: start_time = {start_datetime} (RSS: etnews={etnews_enabled}, mk={mk_enabled}, boan={boan_enabled}, yonhap={yonhap_enabled})")
            
#             try:
#                 print(f"Processing keyword ({processed_keywords + 1}/{len(enabled_keywords)}): {keyword}")
#                 news_items = news_service.search_news(keyword, etnews_enabled=etnews_enabled, mk_enabled=mk_enabled, boan_enabled=boan_enabled, yonhap_enabled=yonhap_enabled)
                
#                 # 시작 시간 이후의 뉴스만 필터링
#                 keyword_new_count = 0
#                 keyword_old_count = 0  # 추가: 기존 뉴스 카운트
#                 for news in news_items:
#                     try:
#                         if news.get('published'):
#                             news_date = news_service.parse_date(news['published'])
#                             if news_date is not None:
#                                 if news_date > start_datetime:
#                                     # 키워드 정보를 뉴스에 추가
#                                     news_with_keyword = news.copy()
#                                     news_with_keyword['alert_keyword'] = keyword
#                                     all_combined_news.append(news_with_keyword)
#                                     keyword_new_count += 1
#                                     print(f"NEW NEWS FOUND for '{keyword}': {news.get('title', '')[:50]}...")
#                                 else:
#                                     keyword_old_count += 1
#                     except Exception as e:
#                         print(f"Error parsing news date for {keyword}: {e}")
#                         continue
#                 processed_keywords += 1
#                 print(f"Keyword '{keyword}' processed: {keyword_new_count} new items, {keyword_old_count} old items. Total accumulated: {len(all_combined_news)}")
#                 # 누적 old count 저장
#                 if 'total_old_count' not in locals():
#                     total_old_count = 0
#                 total_old_count += keyword_old_count
#             except Exception as e:
#                 print(f"Error checking keyword '{keyword}': {e}")
#                 continue
        
#         # 발행 시간 기준으로 최신순 정렬
#         all_combined_news.sort(key=lambda x: news_service.parse_date(x.get('published', '')) or datetime.min.replace(tzinfo=pytz.UTC), reverse=True)
        
#         # 중복 제거 (같은 URL의 뉴스가 여러 키워드에서 검색될 수 있음)
#         seen_urls = set()
#         unique_news = []
#         for news in all_combined_news:
#             url = news.get('link', '')
#             if url and url not in seen_urls:
#                 seen_urls.add(url)
#                 unique_news.append(news)
        
#         print(f"Alert check completed: {processed_keywords} keywords processed, {len(unique_news)} unique new items found (removed {len(all_combined_news) - len(unique_news)} duplicates)")
#         if 'total_old_count' not in locals():
#             total_old_count = 0
#         return jsonify({
#             "enabled": True,
#             "total_new_count": len(unique_news),
#             "total_old_count": total_old_count,
#             "keywords_count": processed_keywords,
#             "combined_results": unique_news[:200]  # 최대 200개 반환
#         })
        
#     except Exception as e:
#         print(f"Error in check-all alerts: {e}")
#         return jsonify({
#             "enabled": True, 
#             "total_new_count": 0,
#             "total_old_count": 0,
#             "keywords_count": 0,
#             "combined_results": [], 
#             "error": str(e)
#         })

@main.route("/api/test/set-visit-time", methods=["POST"])
def api_test_set_visit_time():
    """테스트용: 페이지 접속 시간 수동 설정 API"""
    data = request.get_json()
    visit_time = data.get('visit_time')
    
    if visit_time:
        # session['page_visit_time'] = visit_time # session 제거
        return jsonify({"success": True, "visit_time": visit_time})
    else:
        return jsonify({"error": "visit_time이 필요합니다"}), 400

@main.route("/api/debug/session", methods=["GET"])
def api_debug_session():
    """디버깅용: 세션 변수 확인 API"""
    return jsonify({
        # "news_alert_enabled": session.get('news_alert_enabled', False), # 알람 기능 제거
        # "news_alert_start_time": session.get('news_alert_start_time'), # 알람 기능 제거
        # "page_visit_time": session.get('page_visit_time'), # session 제거
        # "alert_keywords": session.get('alert_keywords', []) # 알람 기능 제거
    })

# @main.route("/api/debug/set-alert-state", methods=["POST"]) # 알람 기능 제거
# def api_debug_set_alert_state(): # 알람 기능 제거
#     """디버깅용: 알람 상태 수동 설정 API""" # 알람 기능 제거
#     data = request.get_json() # 알람 기능 제거
#     enabled = data.get('enabled', False) # 알람 기능 제거
#     start_time = data.get('start_time') # 알람 기능 제거
    
#     session['news_alert_enabled'] = enabled # 알람 기능 제거
#     if start_time: # 알람 기능 제거
#         session['news_alert_start_time'] = start_time # 알람 기능 제거
    
#     return jsonify({ # 알람 기능 제거
#         "success": True, # 알람 기능 제거
#         "enabled": enabled, # 알람 기능 제거
#         "start_time": start_time # 알람 기능 제거
#     }) # 알람 기능 제거

def create_excel_file(company_name, analyzed_news, comprehensive_opinion, file_path):
    """AI 분석 결과를 엑셀 파일로 생성하는 함수"""
    # HTML 태그 제거
    comprehensive_opinion_clean = remove_html_tags(comprehensive_opinion)
    
    # 총평 내용을 웹페이지처럼 줄바꿈으로 포맷팅
    def format_comprehensive_opinion(text):
        """총평 내용을 웹페이지처럼 줄바꿈으로 포맷팅"""
        if not text:
            return text
        
        # 특정 패턴을 찾아 줄바꿈 추가
        import re
        
        # "- " 패턴 앞에 줄바꿈 추가
        text = re.sub(r' - ', '\n- ', text)
        
        # "※" 패턴 앞에 줄바꿈 추가
        text = re.sub(r' ※', '\n※', text)
        
        # "동향분석을", "수상실적은", "투자실적은" 패턴 앞에 줄바꿈 추가
        text = re.sub(r' - 동향분석을', '\n- 동향분석을', text)
        text = re.sub(r' - 수상실적은', '\n- 수상실적은', text)
        text = re.sub(r' - 투자실적은', '\n- 투자실적은', text)
        
        # 연속된 줄바꿈 정리
        text = re.sub(r'\n\s*\n', '\n', text)
        
        return text.strip()
    
    comprehensive_opinion_formatted = format_comprehensive_opinion(comprehensive_opinion_clean)
    
    # 엑셀 워크북 생성
    wb = Workbook()
    
    # 첫 번째 시트: 종합 분석 결과
    ws1 = wb.active
    ws1.title = "종합 분석 결과"
    
    # 메인 타이틀 (A~E 컬럼 합침)
    ws1['A1'] = f"📊 {company_name} AI 종합 분석 보고서"
    ws1['A1'].font = Font(bold=True, size=16, color="FFFFFF")
    ws1['A1'].alignment = Alignment(horizontal='center', vertical='center')
    ws1['A1'].fill = PatternFill(start_color="2E86AB", end_color="2E86AB", fill_type="solid")  # 진한 파란색 배경
    ws1.merge_cells('A1:E1')
    ws1.row_dimensions[1].height = 35
    
    # 분석 날짜 정보
    from datetime import datetime
    current_date = datetime.now().strftime("%Y년 %m월 %d일")
    ws1['A2'] = f"📅 분석일: {current_date}"
    ws1['A2'].font = Font(size=10, color="666666")
    ws1['A2'].alignment = Alignment(horizontal='right')
    ws1.merge_cells('A2:E2')
    ws1.row_dimensions[2].height = 20
    
    # 총평 섹션 헤더
    ws1['A4'] = "🔍 종합 분석 결과"
    ws1['A4'].font = Font(bold=True, size=14, color="FFFFFF")
    ws1['A4'].alignment = Alignment(horizontal='center', vertical='center')
    ws1['A4'].fill = PatternFill(start_color="A23B72", end_color="A23B72", fill_type="solid")  # 보라색 배경
    ws1.merge_cells('A4:E4')
    ws1.row_dimensions[4].height = 30
    
    # 종합 분석 결과 헤더에 테두리 추가
    from openpyxl.styles import Border, Side
    thin_border = Border(left=Side(style='thin'), right=Side(style='thin'), 
                       top=Side(style='thin'), bottom=Side(style='thin'))
    ws1['A4'].border = thin_border
    
    # 총평 내용 (A~E 컬럼 합쳐서 표시)
    ws1['A5'] = comprehensive_opinion_formatted
    ws1['A5'].font = Font(size=11)
    ws1['A5'].alignment = Alignment(wrap_text=True, vertical='top', horizontal='left')
    ws1['A5'].fill = PatternFill(start_color="F8F9FA", end_color="F8F9FA", fill_type="solid")  # 연한 회색 배경
    ws1.merge_cells('A5:E5')  # A~E 컬럼 합침
    
    # 종합 분석 결과 내용에 테두리 추가 (병합된 셀의 모든 경계에 적용)
    for col in ['A', 'B', 'C', 'D', 'E']:
        ws1[f'{col}5'].border = thin_border
    
    # 총평 내용의 높이 계산 및 설정
    opinion_lines = len(comprehensive_opinion_formatted.split('\n')) + comprehensive_opinion_formatted.count('.') // 2
    opinion_height = max(opinion_lines, 10)  # 최소 10줄 높이
    
    # 총평 셀의 높이 설정
    ws1.row_dimensions[5].height = opinion_height * 16  # 16포인트씩 높이 설정
    
    # 통계 정보 계산
    def calculate_statistics():
        """뉴스 분석 결과에서 통계 정보 계산"""
        total_news = len(analyzed_news)
        
        # 평균 긍정/부정 점수 계산
        sentiment_scores = []
        for news in analyzed_news:
            trend_analysis = news.get('trend_analysis', {})
            score = trend_analysis.get('sentiment_score', 0)
            if score is not None:
                sentiment_scores.append(score)
        
        avg_sentiment = sum(sentiment_scores) / len(sentiment_scores) if sentiment_scores else 0
        
        # 총평 내용에서 수상실적과 투자실적 건수 추출
        def extract_counts_from_opinion(opinion_text):
            """총평 내용에서 수상실적과 투자실적 건수 추출"""
            import re
            
            award_count = 0
            investment_count = 0
            
            # 수상실적 패턴 찾기
            award_patterns = [
                r'수상실적은\s*(\d+)건',
                r'수상실적\s*(\d+)건',
                r'수상\s*(\d+)건'
            ]
            
            for pattern in award_patterns:
                match = re.search(pattern, opinion_text)
                if match:
                    award_count = int(match.group(1))
                    break
            
            # 투자실적 패턴 찾기
            investment_patterns = [
                r'투자실적은\s*(\d+)건',
                r'투자실적\s*(\d+)건',
                r'투자\s*(\d+)건'
            ]
            
            for pattern in investment_patterns:
                match = re.search(pattern, opinion_text)
                if match:
                    investment_count = int(match.group(1))
                    break
            
            return award_count, investment_count
        
        award_count, investment_count = extract_counts_from_opinion(comprehensive_opinion_clean)
        
        return {
            'total_news': total_news,
            'avg_sentiment': avg_sentiment,
            'award_count': award_count,
            'investment_count': investment_count
        }
    
    stats = calculate_statistics()
    print(f"전체 뉴스 수: {stats['total_news']}")
    print(f"총평에서 추출한 수상실적 건수: {stats['award_count']}")
    print(f"총평에서 추출한 투자실적 건수: {stats['investment_count']}")
    print(f"평균 감정점수: {stats['avg_sentiment']}")
    
    # 통계 정보 표시 (총평 아래)
    stats_row = 7
    ws1[f'A{stats_row}'] = "📈 핵심 지표 요약"
    ws1[f'A{stats_row}'].font = Font(bold=True, size=13, color="FFFFFF")
    ws1[f'A{stats_row}'].alignment = Alignment(horizontal='center', vertical='center')
    ws1[f'A{stats_row}'].fill = PatternFill(start_color="F18F01", end_color="F18F01", fill_type="solid")  # 주황색 배경
    ws1.merge_cells(f'A{stats_row}:E{stats_row}')
    ws1.row_dimensions[stats_row].height = 28
    
    # 핵심 지표 요약 헤더에 테두리 추가
    from openpyxl.styles import Border, Side
    thin_border = Border(left=Side(style='thin'), right=Side(style='thin'), 
                       top=Side(style='thin'), bottom=Side(style='thin'))
    ws1[f'A{stats_row}'].border = thin_border
    
    # 통계 카드 스타일로 표시
    stats_row += 1
    
    # 헤더 행 (평균 감정점수, 수상실적, 투자실적)
    ws1[f'A{stats_row}'] = "💭 평균 감정점수"
    ws1[f'A{stats_row}'].font = Font(bold=True, size=11, color="FFFFFF")
    ws1[f'A{stats_row}'].alignment = Alignment(horizontal='center', vertical='center')
    ws1[f'A{stats_row}'].fill = PatternFill(start_color="2196F3", end_color="2196F3", fill_type="solid")  # 파란색
    ws1[f'A{stats_row}'].border = thin_border
    
    ws1[f'B{stats_row}'] = "🏆 수상실적"
    ws1[f'B{stats_row}'].font = Font(bold=True, size=11, color="FFFFFF")
    ws1[f'B{stats_row}'].alignment = Alignment(horizontal='center', vertical='center')
    ws1[f'B{stats_row}'].fill = PatternFill(start_color="4CAF50", end_color="4CAF50", fill_type="solid")  # 초록색
    ws1[f'B{stats_row}'].border = thin_border
    
    ws1[f'C{stats_row}'] = "💰 투자실적"
    ws1[f'C{stats_row}'].font = Font(bold=True, size=11, color="FFFFFF")
    ws1[f'C{stats_row}'].alignment = Alignment(horizontal='center', vertical='center')
    ws1[f'C{stats_row}'].fill = PatternFill(start_color="9C27B0", end_color="9C27B0", fill_type="solid")  # 보라색
    ws1[f'C{stats_row}'].border = thin_border
    
    ws1.row_dimensions[stats_row].height = 25
    
    # 값 행
    stats_row += 1
    
    # 감정점수에 따른 색상 설정
    sentiment_score = stats['avg_sentiment']
    if sentiment_score > 0:
        score_color = "2196F3"  # 파란색 (긍정)
    elif sentiment_score < 0:
        score_color = "F44336"  # 빨간색 (부정)
    else:
        score_color = "9E9E9E"  # 회색 (중립)
    
    ws1[f'A{stats_row}'] = f"{sentiment_score:+.1f}"
    ws1[f'A{stats_row}'].font = Font(bold=True, size=16, color=score_color)
    ws1[f'A{stats_row}'].alignment = Alignment(horizontal='center', vertical='center')
    ws1[f'A{stats_row}'].fill = PatternFill(start_color="F8F9FA", end_color="F8F9FA", fill_type="solid")  # 연한 회색 배경
    ws1[f'A{stats_row}'].border = thin_border
    
    ws1[f'B{stats_row}'] = f"{stats['award_count']}"
    ws1[f'B{stats_row}'].font = Font(bold=True, size=16, color="4CAF50")
    ws1[f'B{stats_row}'].alignment = Alignment(horizontal='center', vertical='center')
    ws1[f'B{stats_row}'].fill = PatternFill(start_color="F8F9FA", end_color="F8F9FA", fill_type="solid")  # 연한 회색 배경
    ws1[f'B{stats_row}'].border = thin_border
    
    ws1[f'C{stats_row}'] = f"{stats['investment_count']}"
    ws1[f'C{stats_row}'].font = Font(bold=True, size=16, color="9C27B0")
    ws1[f'C{stats_row}'].alignment = Alignment(horizontal='center', vertical='center')
    ws1[f'C{stats_row}'].fill = PatternFill(start_color="F8F9FA", end_color="F8F9FA", fill_type="solid")  # 연한 회색 배경
    ws1[f'C{stats_row}'].border = thin_border
    
    ws1.row_dimensions[stats_row].height = 35
    
    # 차트 데이터 시작 위치
    chart_start_row = stats_row + 4
    
    # 날짜 정렬을 위한 함수
    def parse_date_for_sorting(date_str):
        """날짜 문자열을 정렬 가능한 형태로 변환"""
        if not date_str:
            return datetime.min
        
        try:
            from datetime import datetime
            import pytz
            
            # 다양한 날짜 형식 처리
            date_formats = [
                '%a, %d %b %Y %H:%M:%S %z',  # Fri, 15 Aug 2025 15:02:00 +0000
                '%a, %d %b %Y %H:%M:%S %Z',  # Fri, 15 Aug 2025 15:02:00 UTC
                '%Y-%m-%d %H:%M:%S',         # 2025-08-15 15:02:00
                '%Y-%m-%d',                  # 2025-08-15
                '%d %b %Y',                  # 15 Aug 2025
                '%Y/%m/%d',                  # 2025/08/15
            ]
            
            for fmt in date_formats:
                try:
                    return datetime.strptime(date_str, fmt)
                except ValueError:
                    continue
            
            return datetime.min
        except:
            return datetime.min
    
    # 뉴스를 날짜순으로 정렬 (오래된 날짜부터)
    sorted_news = sorted(analyzed_news, key=lambda x: parse_date_for_sorting(x.get('news_info', {}).get('published', '')))
    
    # 중간 리스트 제거 - 수상실적/투자실적 표만 표시
    
    # 2. 수상실적 표 생성
    try:
        # 수상실적 데이터 준비 (실적이 있는 뉴스만 필터링)
        award_events = []
        
        for news in analyzed_news:
            news_info = news.get('news_info', {})
            award_analysis = news.get('award_analysis', {})
            
            if award_analysis.get('is_award_related') == 'Y':
                award_events.append({
                    'date': convert_date_to_korean(news_info.get('published', '')),
                    'award_name': remove_html_tags(award_analysis.get('award_name', '')),
                    'title': remove_html_tags(news_info.get('title', '')),
                    'link': news_info.get('link', '')
                })
        
        if award_events:
            # 수상실적 표 데이터를 첫 번째 시트에 추가
            award_table_start_row = chart_start_row + 2
            
            # 수상실적 표 헤더
            ws1[f'A{award_table_start_row}'] = "🏆 수상실적"
            ws1[f'A{award_table_start_row}'].font = Font(bold=True, size=12, color="FFFFFF")
            ws1[f'A{award_table_start_row}'].fill = PatternFill(start_color="FF6B35", end_color="FF6B35", fill_type="solid")
            ws1[f'A{award_table_start_row}'].alignment = Alignment(horizontal='center', vertical='center')
            ws1.merge_cells(f'A{award_table_start_row}:D{award_table_start_row}')
            ws1.row_dimensions[award_table_start_row].height = 25
            
            # 수상실적 표 컬럼 헤더
            ws1[f'A{award_table_start_row + 1}'] = "날짜"
            ws1[f'B{award_table_start_row + 1}'] = "수상실적명"
            ws1[f'C{award_table_start_row + 1}'] = "뉴스 제목"
            ws1[f'D{award_table_start_row + 1}'] = "뉴스 링크"
            
            for col in ['A', 'B', 'C', 'D']:
                ws1[f'{col}{award_table_start_row + 1}'].font = Font(bold=True)
                ws1[f'{col}{award_table_start_row + 1}'].fill = PatternFill(start_color="F0F0F0", end_color="F0F0F0", fill_type="solid")
            
            # 수상실적 데이터 입력
            for i, event in enumerate(award_events, 1):
                ws1[f'A{award_table_start_row + 1 + i}'] = event['date']
                ws1[f'B{award_table_start_row + 1 + i}'] = event['award_name']
                ws1[f'C{award_table_start_row + 1 + i}'] = event['title']
                ws1[f'D{award_table_start_row + 1 + i}'] = event['link']
            
            # 표 테두리 설정
            from openpyxl.styles import Border, Side
            thin_border = Border(left=Side(style='thin'), right=Side(style='thin'), 
                               top=Side(style='thin'), bottom=Side(style='thin'))
            
            for row in range(award_table_start_row + 1, award_table_start_row + 2 + len(award_events)):
                for col in ['A', 'B', 'C', 'D']:
                    ws1[f'{col}{row}'].border = thin_border
            
            # 컬럼 너비 설정
            ws1.column_dimensions['A'].width = 20  # 날짜
            ws1.column_dimensions['B'].width = 40  # 수상실적명
            ws1.column_dimensions['C'].width = 50  # 뉴스 제목
            ws1.column_dimensions['D'].width = 60  # 뉴스 링크
            
            investment_table_start_row = award_table_start_row + 3 + len(award_events)
        else:
            investment_table_start_row = chart_start_row + 2
        
    except Exception as e:
        print(f"수상실적 표 생성 중 오류: {e}")
        investment_table_start_row = chart_start_row + 15
    
    # 3. 투자실적 표 생성
    try:
        # 투자실적 데이터 준비 (실적이 있는 뉴스만 필터링)
        investment_events = []
        
        for news in analyzed_news:
            news_info = news.get('news_info', {})
            investment_analysis = news.get('investment_analysis', {})
            
            if investment_analysis.get('is_investment_related') == 'Y':
                investment_events.append({
                    'date': convert_date_to_korean(news_info.get('published', '')),
                    'investment_name': remove_html_tags(investment_analysis.get('investment_name', '')),
                    'title': remove_html_tags(news_info.get('title', '')),
                    'link': news_info.get('link', '')
                })
        
        if investment_events:
            # 투자실적 표 데이터를 첫 번째 시트에 추가
            investment_table_start_row = max(investment_table_start_row, chart_start_row + 2)
            
            # 투자실적 표 헤더
            ws1[f'A{investment_table_start_row}'] = "💰 투자실적"
            ws1[f'A{investment_table_start_row}'].font = Font(bold=True, size=12, color="FFFFFF")
            ws1[f'A{investment_table_start_row}'].fill = PatternFill(start_color="28A745", end_color="28A745", fill_type="solid")
            ws1[f'A{investment_table_start_row}'].alignment = Alignment(horizontal='center', vertical='center')
            ws1.merge_cells(f'A{investment_table_start_row}:D{investment_table_start_row}')
            ws1.row_dimensions[investment_table_start_row].height = 25
            
            # 투자실적 표 컬럼 헤더
            ws1[f'A{investment_table_start_row + 1}'] = "날짜"
            ws1[f'B{investment_table_start_row + 1}'] = "투자실적명"
            ws1[f'C{investment_table_start_row + 1}'] = "뉴스 제목"
            ws1[f'D{investment_table_start_row + 1}'] = "뉴스 링크"
            
            for col in ['A', 'B', 'C', 'D']:
                ws1[f'{col}{investment_table_start_row + 1}'].font = Font(bold=True)
                ws1[f'{col}{investment_table_start_row + 1}'].fill = PatternFill(start_color="F0F0F0", end_color="F0F0F0", fill_type="solid")
            
            # 투자실적 데이터 입력
            for i, event in enumerate(investment_events, 1):
                ws1[f'A{investment_table_start_row + 1 + i}'] = event['date']
                ws1[f'B{investment_table_start_row + 1 + i}'] = event['investment_name']
                ws1[f'C{investment_table_start_row + 1 + i}'] = event['title']
                ws1[f'D{investment_table_start_row + 1 + i}'] = event['link']
            
            # 표 테두리 설정
            from openpyxl.styles import Border, Side
            thin_border = Border(left=Side(style='thin'), right=Side(style='thin'), 
                               top=Side(style='thin'), bottom=Side(style='thin'))
            
            for row in range(investment_table_start_row + 1, investment_table_start_row + 2 + len(investment_events)):
                for col in ['A', 'B', 'C', 'D']:
                    ws1[f'{col}{row}'].border = thin_border
            
            # 컬럼 너비 설정
            ws1.column_dimensions['A'].width = 20  # 날짜
            ws1.column_dimensions['B'].width = 40  # 투자실적명
            ws1.column_dimensions['C'].width = 50  # 뉴스 제목
            ws1.column_dimensions['D'].width = 60  # 뉴스 링크
            
    except Exception as e:
        print(f"투자실적 표 생성 중 오류: {e}")
    
    # 두 번째 시트: 뉴스별 분석 결과
    ws2 = wb.create_sheet("뉴스별 분석 결과")
    
    # 헤더 설정
    headers = [
        "분석소스", "뉴스 제목", "뉴스 내용", "출처", "날짜", "링크",
        "동향분석 요약", "감정점수", "감정라벨",
        "수상여부", "수상명", "수상이유",
        "투자여부", "투자명", "투자이유"
    ]
    
    # 테두리 스타일 정의
    from openpyxl.styles import Border, Side
    thin_border = Border(left=Side(style='thin'), right=Side(style='thin'), 
                       top=Side(style='thin'), bottom=Side(style='thin'))
    
    for col, header in enumerate(headers, 1):
        cell = ws2.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True)
        cell.fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
        cell.font = Font(bold=True, color="FFFFFF")
        cell.alignment = Alignment(horizontal='center', vertical='center')
        cell.border = thin_border
    
    # 데이터 입력
    row = 2
    for news in analyzed_news:
        news_info = news.get('news_info', {})
        trend_analysis = news.get('trend_analysis', {})
        award_analysis = news.get('award_analysis', {})
        investment_analysis = news.get('investment_analysis', {})
        
        # 분석소스 코드 추출
        source_code = get_news_source_code(news_info)
        
        # 뉴스 내용 추출 (description이 비어있으면 title 사용)
        description = news_info.get('description', '')
        if not description or description.strip() == '':
            description = news_info.get('title', '')
            print(f"[DEBUG] 뉴스 {row-1}번: description이 비어있어 title 사용")
        
        ws2.cell(row=row, column=1, value=source_code)  # 분석소스
        ws2.cell(row=row, column=2, value=remove_html_tags(news_info.get('title', '')))  # 뉴스 제목
        ws2.cell(row=row, column=3, value=remove_html_tags(description))  # 뉴스 내용
        ws2.cell(row=row, column=4, value=news_info.get('source', ''))  # 출처
        ws2.cell(row=row, column=5, value=convert_date_to_korean(news_info.get('published', '')))  # 날짜
        ws2.cell(row=row, column=6, value=news_info.get('link', ''))  # 링크
        ws2.cell(row=row, column=7, value=remove_html_tags(trend_analysis.get('news_trend_summary', '')))  # 동향분석 요약
        ws2.cell(row=row, column=8, value=trend_analysis.get('sentiment_score', ''))  # 감정점수
        ws2.cell(row=row, column=9, value=remove_html_tags(trend_analysis.get('sentiment_label', '')))  # 감정라벨
        ws2.cell(row=row, column=10, value=award_analysis.get('is_award_related', ''))  # 수상여부
        ws2.cell(row=row, column=11, value=remove_html_tags(award_analysis.get('award_name', '')))  # 수상명
        ws2.cell(row=row, column=12, value=remove_html_tags(award_analysis.get('award_reason', '')))  # 수상이유
        ws2.cell(row=row, column=13, value=investment_analysis.get('is_investment_related', ''))  # 투자여부
        ws2.cell(row=row, column=14, value=remove_html_tags(investment_analysis.get('investment_name', '')))  # 투자명
        ws2.cell(row=row, column=15, value=remove_html_tags(investment_analysis.get('investment_reason', '')))  # 투자이유
        
        # 데이터 행에 테두리 추가
        for col in range(1, 16):  # 1부터 15까지 (15개 컬럼)
            ws2.cell(row=row, column=col).border = thin_border
        
        row += 1
    
    # 열 너비 자동 조정 (병합된 셀 고려)
    for col_num in range(1, ws2.max_column + 1):
        max_length = 0
        column_letter = get_column_letter(col_num)
        
        for row_num in range(1, ws2.max_row + 1):
            cell = ws2.cell(row=row_num, column=col_num)
            try:
                if cell.value and len(str(cell.value)) > max_length:
                    max_length = len(str(cell.value))
            except:
                pass
        
        adjusted_width = min(max_length + 2, 50)  # 최대 50자로 제한
        ws2.column_dimensions[column_letter].width = adjusted_width
    
    # 차트 생성 (ws2의 감정점수 데이터 참조)
    try:
        from openpyxl.chart import LineChart, Reference
        
        # ws2의 데이터 개수 확인
        total_news_count = len(analyzed_news)
        
        if total_news_count > 0:
            # 꺾은선 차트 생성
            chart = LineChart()
            chart.title = f"{company_name} 뉴스별 긍정/부정 점수 (시간순)"
            chart.style = 12  # 꺾은선 그래프 스타일
            chart.x_axis.title = "날짜"
            chart.y_axis.title = "긍정/부정 점수"
            
            # 범례 제거
            chart.legend = None
            
            # Y축 범위 설정 (-10 ~ 10)
            try:
                chart.y_axis.scaling.min = -10
                chart.y_axis.scaling.max = 10
            except Exception as axis_error:
                print(f"[DEBUG] Y축 범위 설정 실패 (무시): {axis_error}")
            
            # ws2의 E컬럼(날짜)과 H컬럼(감정점수) 참조
            # 데이터 범위: 2행부터 (헤더 제외)
            data_start_row = 2
            data_end_row = 1 + total_news_count
            
            # 데이터 범위 설정 (감정점수 - H컬럼 = 8, 헤더 포함)
            data = Reference(ws2, min_col=8, min_row=1, max_row=data_end_row)
            # 카테고리 범위 설정 (날짜 - E컬럼 = 5, 헤더 제외)
            cats = Reference(ws2, min_col=5, min_row=data_start_row, max_row=data_end_row)
            
            chart.add_data(data, titles_from_data=True)
            chart.set_categories(cats)
            
            # X축 레이블 각도 설정 (날짜가 길어서 겹치지 않도록)
            try:
                chart.x_axis.tickLblSkip = 1  # 모든 레이블 표시
                chart.x_axis.tickMarkSkip = 1
            except Exception as x_axis_error:
                print(f"[DEBUG] X축 레이블 설정 실패 (무시): {x_axis_error}")
            
            # 차트 크기 설정
            chart.width = 15
            chart.height = 10
            
            # 차트를 첫 번째 시트에 추가 (종합 분석 결과 옆, F4부터)
            ws1.add_chart(chart, "F4")
            print(f"[DEBUG] 꺾은선 차트 생성 완료: {total_news_count}개 뉴스 데이터 참조")
        else:
            print(f"[DEBUG] 차트 생성 건너뜀: 뉴스 데이터 없음")
    except Exception as e:
        print(f"[ERROR] 차트 생성 중 오류: {e}")
        import traceback
        print(f"[ERROR] 차트 생성 오류 상세: {traceback.format_exc()}")
    
    # 엑셀 파일 저장
    try:
        wb.save(file_path)
        print(f"[DEBUG] 엑셀 파일 저장 완료: {file_path}")
        return file_path
    except Exception as save_error:
        print(f"[DEBUG] 엑셀 파일 저장 실패: {str(save_error)}")
        import traceback
        print(f"[DEBUG] 엑셀 파일 저장 오류 상세: {traceback.format_exc()}")
        raise save_error

def auto_save_to_archive(company_name, analyzed_news, comprehensive_opinion, start_date=None, end_date=None, user_id=None, user_email=None):
    """AI 분석 완료 시 공개자료실에 자동 저장"""
    import traceback
    print(f"[DEBUG] ===== auto_save_to_archive 함수 호출됨 =====")
    print(f"[DEBUG] 호출 스택:")
    stack = traceback.extract_stack()
    for i, frame in enumerate(stack[-20:]):  # 최근 20개 프레임
        print(f"[DEBUG]   {i}: {frame.filename}:{frame.lineno} - {frame.name}")
    print(f"[DEBUG] company_name: {company_name}")
    print(f"[DEBUG] analyzed_news_count: {len(analyzed_news) if analyzed_news else 0}")
    print(f"[DEBUG] comprehensive_opinion 길이: {len(comprehensive_opinion) if comprehensive_opinion else 0}")
    print(f"[DEBUG] start_date: {start_date}")
    print(f"[DEBUG] end_date: {end_date}")
    print(f"[DEBUG] user_id: {user_id}")
    print(f"[DEBUG] user_email: {user_email}")
    
    # 입력 데이터 유효성 검사 강화
    if not company_name:
        print(f"[DEBUG] 오류: company_name이 없습니다!")
        return False
    
    if not analyzed_news or len(analyzed_news) == 0:
        print(f"[DEBUG] 오류: analyzed_news가 없거나 비어있습니다!")
        return False
    
    # analyzed_news 데이터 구조 검증
    try:
        if not isinstance(analyzed_news, list):
            print(f"[DEBUG] 오류: analyzed_news가 리스트가 아닙니다! 타입: {type(analyzed_news)}")
            # 리스트가 아니면 변환 시도
            if isinstance(analyzed_news, dict):
                analyzed_news = [analyzed_news]
                print(f"[DEBUG] analyzed_news를 리스트로 변환했습니다.")
            else:
                print(f"[DEBUG] analyzed_news를 리스트로 변환할 수 없습니다.")
                return False
        
        # 빈 리스트인지 확인
        if not analyzed_news or len(analyzed_news) == 0:
            print(f"[DEBUG] 오류: analyzed_news가 비어있습니다!")
            return False
        
        # 첫 번째 뉴스의 구조 검증
        if analyzed_news and len(analyzed_news) > 0:
            first_news = analyzed_news[0]
            if not isinstance(first_news, dict):
                print(f"[DEBUG] 오류: 첫 번째 뉴스가 딕셔너리가 아닙니다! 타입: {type(first_news)}")
                return False
            
            required_keys = ['news_info', 'trend_analysis', 'award_analysis', 'investment_analysis']
            missing_keys = [key for key in required_keys if key not in first_news]
            if missing_keys:
                print(f"[DEBUG] 오류: 뉴스 데이터에 필수 키가 누락되었습니다: {missing_keys}")
                print(f"[DEBUG] 첫 번째 뉴스 키들: {list(first_news.keys())}")
                return False
                
    except Exception as validation_error:
        print(f"[DEBUG] 데이터 구조 검증 중 오류: {str(validation_error)}")
        import traceback
        print(f"[DEBUG] 데이터 구조 검증 오류 상세: {traceback.format_exc()}")
        return False
    
    # 사용자 정보가 없으면 세션에서 가져오기 시도
    if not user_id or not user_email:
        try:
            from flask import session
            user_id = user_id or session.get('user_id')
            user_email = user_email or session.get('user_email', '')
            print(f"[DEBUG] 세션에서 사용자 정보 가져옴 - user_id: {user_id}, user_email: {user_email}")
        except Exception as session_error:
            print(f"[DEBUG] 세션 접근 실패: {str(session_error)}")
            if not user_id or not user_email:
                print(f"[DEBUG] 오류: 사용자 정보가 없습니다!")
                return False
    
    # user_id가 없으면 기본값 사용 (엑셀 저장은 계속 진행)
    if not user_id:
        print(f"[DEBUG] 경고: user_id가 없어서 기본값을 사용합니다!")
        user_id = 1  # 정수형으로 변경
        user_email = "unknown@example.com"
    elif isinstance(user_id, str):
        try:
            user_id = int(user_id)
            print(f"[DEBUG] user_id를 정수로 변환: {user_id}")
        except ValueError:
            print(f"[DEBUG] user_id를 정수로 변환할 수 없어서 기본값 사용: {user_id}")
            user_id = 1
    
    try:
        print(f"[DEBUG] auto_save_to_archive 시작: company_name={company_name}, analyzed_news_count={len(analyzed_news)}")
        
        # 아카이브 디렉토리 생성
        archive_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'archives')
        os.makedirs(archive_dir, exist_ok=True)
        print(f"[DEBUG] 아카이브 디렉토리 생성: {archive_dir}")
        
        # 파일명 생성 (사용자 아이디 포함)
        user_email = user_email or 'unknown'
        user_id_part = user_email.split('@')[0] if '@' in user_email else 'unknown'
        timestamp = datetime.now().strftime("%Y%m%d_%H%M")
        filename = f"{user_id_part}_{company_name}_AI분석결과_{timestamp}.xlsx"
        print(f"[DEBUG] auto_save에서 생성할 파일명: {filename}")
        
        # 아카이브 파일 경로
        archive_path = os.path.join(archive_dir, filename)
        print(f"[DEBUG] 아카이브 파일 경로: {archive_path}")
        
        # 공통 엑셀 생성 함수 사용
        print(f"[DEBUG] 엑셀 파일 생성 시작")
        print(f"[DEBUG] - 파일 경로: {archive_path}")
        print(f"[DEBUG] - 회사명: {company_name}")
        print(f"[DEBUG] - 분석된 뉴스 수: {len(analyzed_news)}")
        print(f"[DEBUG] - 종합의견 길이: {len(comprehensive_opinion) if comprehensive_opinion else 0}")
        
        # comprehensive_opinion 검증 및 기본값 설정
        if not comprehensive_opinion:
            comprehensive_opinion = f"{company_name}에 대한 AI 분석이 완료되었습니다."
            print(f"[DEBUG] 종합의견이 없어서 기본값을 사용합니다.")
        elif not isinstance(comprehensive_opinion, str):
            comprehensive_opinion = str(comprehensive_opinion)
            print(f"[DEBUG] 종합의견을 문자열로 변환했습니다.")
        
        print(f"[DEBUG] 최종 comprehensive_opinion 길이: {len(comprehensive_opinion)}")
        
        try:
            create_excel_file(company_name, analyzed_news, comprehensive_opinion, archive_path)
            print(f"[DEBUG] 엑셀 파일 생성 완료")
        except Exception as excel_error:
            print(f"[DEBUG] 엑셀 파일 생성 실패: {str(excel_error)}")
            import traceback
            print(f"[DEBUG] 엑셀 파일 생성 오류 상세: {traceback.format_exc()}")
            
            # 엑셀 생성 실패 시에도 간단한 엑셀 파일 생성 시도
            try:
                print(f"[DEBUG] 간단한 엑셀 파일 생성 시도...")
                create_simple_excel_file(company_name, analyzed_news, comprehensive_opinion, archive_path)
                print(f"[DEBUG] 간단한 엑셀 파일 생성 완료")
            except Exception as simple_excel_error:
                print(f"[DEBUG] 간단한 엑셀 파일 생성도 실패: {str(simple_excel_error)}")
                return False
        
        # 파일 크기 계산
        try:
            file_size = os.path.getsize(archive_path)
            print(f"[DEBUG] 파일 크기: {file_size} bytes")
        except Exception as size_error:
            print(f"[DEBUG] 파일 크기 계산 실패: {str(size_error)}")
            file_size = 0
        
        # 공개자료실 데이터베이스에 저장
        print(f"[DEBUG] 데이터베이스 저장 시작: user_id={user_id}, analyzer_name={user_id_part}, user_email={user_email}")
        print(f"[DEBUG] user_id 타입: {type(user_id)}, 값: {user_id}")
        
        try:
            # Archive 모델과 db import 확인
            try:
                from app.models import Archive, db
                print(f"[DEBUG] Archive 모델과 db import 성공")
            except ImportError as import_error:
                print(f"[DEBUG] Archive 모델 또는 db import 실패: {str(import_error)}")
                # 엑셀 파일은 생성되었으므로 성공으로 처리
                print(f"[DEBUG] 엑셀 파일 생성은 성공했지만 데이터베이스 저장은 실패했습니다.")
                return True
            
            # 데이터베이스 연결 상태 확인
            try:
                from sqlalchemy import text
                db.session.execute(text('SELECT 1'))
                print(f"[DEBUG] 데이터베이스 연결 상태 확인 성공")
            except Exception as db_conn_error:
                print(f"[DEBUG] 데이터베이스 연결 오류: {str(db_conn_error)}")
                # 엑셀 파일은 생성되었으므로 성공으로 처리
                print(f"[DEBUG] 엑셀 파일 생성은 성공했지만 데이터베이스 저장은 실패했습니다.")
                return True
            
            analyzer_name = user_id_part
            
            # 분석기간 설정 (검색기간이 있으면 사용, 없으면 현재 날짜)
            if start_date and end_date:
                # 날짜 형식 변환 (YYYY-MM-DD -> YYYY년 MM월 DD일)
                try:
                    start_date_obj = datetime.strptime(start_date, "%Y-%m-%d")
                    end_date_obj = datetime.strptime(end_date, "%Y-%m-%d")
                    analysis_period = f"{start_date_obj.strftime('%Y년 %m월 %d일')} ~ {end_date_obj.strftime('%Y년 %m월 %d일')}"
                except:
                    analysis_period = f"{start_date} ~ {end_date}"
            else:
                analysis_period = datetime.now().strftime("%Y년 %m월 %d일")
            
            print(f"[DEBUG] Archive 객체 생성 시작")
            print(f"[DEBUG] - user_id: {user_id} (타입: {type(user_id)})")
            print(f"[DEBUG] - original_filename: {filename}")
            print(f"[DEBUG] - file_path: {archive_path}")
            print(f"[DEBUG] - file_size: {file_size}")
            print(f"[DEBUG] - company_name: {company_name}")
            print(f"[DEBUG] - stored_filename: {filename}")
            print(f"[DEBUG] - analyzer_name: {analyzer_name}")
            print(f"[DEBUG] - analysis_period: {analysis_period}")
            
            archive = Archive(
                user_id=user_id,
                original_filename=filename,
                file_path=archive_path,
                file_size=file_size,
                company_name=company_name,
                stored_filename=filename,
                analyzer_name=analyzer_name,
                analysis_period=analysis_period
            )
            print(f"[DEBUG] Archive 객체 생성 완료: {archive}")
            
            print(f"[DEBUG] db.session.add() 시작")
            db.session.add(archive)
            print(f"[DEBUG] db.session.add() 완료")
            
            print(f"[DEBUG] db.session.commit() 시작")
            db.session.commit()
            print(f"[DEBUG] db.session.commit() 완료")
            
            print(f"[DEBUG] 공개자료실 자동 저장 완료: {filename}, 크기: {file_size} bytes")
            print(f"[DEBUG] 저장된 아카이브 ID: {archive.id}")
            print(f"[DEBUG] ===== auto_save_to_archive 함수 완료 =====")
            return True
            
        except Exception as db_error:
            print(f"[DEBUG] 데이터베이스 저장 중 오류: {str(db_error)}")
            try:
                db.session.rollback()
            except:
                pass
            import traceback
            print(f"[DEBUG] 데이터베이스 오류 상세: {traceback.format_exc()}")
            # 엑셀 파일은 생성되었으므로 성공으로 처리
            print(f"[DEBUG] 엑셀 파일 생성은 성공했지만 데이터베이스 저장은 실패했습니다.")
            return True
        
    except Exception as e:
        print(f"[DEBUG] 공개자료실 자동 저장 실패: {str(e)}")
        import traceback
        print(f"[DEBUG] 전체 오류 상세: {traceback.format_exc()}")
        try:
            db.session.rollback()
        except:
            pass
        print(f"[DEBUG] ===== auto_save_to_archive 함수 실패 =====")
        return False

def test_auto_save():
    """자동저장 테스트 함수"""
    print(f"[DEBUG] ===== 자동저장 테스트 시작 =====")
    
    # 테스트 데이터 생성
    test_company_name = "테스트회사"
    test_analyzed_news = [
        {
            "news_info": {
                "title": "테스트 뉴스 제목",
                "description": "테스트 뉴스 내용",
                "source": "테스트 출처",
                "published": "2025-01-01",
                "link": "http://test.com"
            },
            "trend_analysis": {
                "news_trend_summary": "테스트 동향 분석",
                "sentiment_score": 5,
                "sentiment_label": "긍정적"
            },
            "award_analysis": {
                "is_award_related": "N",
                "award_reason": "테스트",
                "award_name": ""
            },
            "investment_analysis": {
                "is_investment_related": "N",
                "investment_reason": "테스트",
                "investment_name": ""
            }
        }
    ]
    test_comprehensive_opinion = "테스트 종합 분석 결과입니다."
    
    try:
        result = auto_save_to_archive(
            test_company_name,
            test_analyzed_news,
            test_comprehensive_opinion,
            "2025-01-01",
            "2025-01-31",
            "test_user",
            "test@example.com"
        )
        print(f"[DEBUG] 자동저장 테스트 결과: {result}")
        return result
    except Exception as e:
        print(f"[DEBUG] 자동저장 테스트 실패: {str(e)}")
        import traceback
        print(f"[DEBUG] 자동저장 테스트 오류 상세: {traceback.format_exc()}")
        return False

def create_simple_excel_file(company_name, analyzed_news, comprehensive_opinion, file_path):
    """간단한 엑셀 파일 생성 함수 (기본 엑셀 생성 실패 시 사용)"""
    try:
        print(f"[DEBUG] 간단한 엑셀 파일 생성 시작: {file_path}")
        
        # 엑셀 워크북 생성
        wb = Workbook()
        ws = wb.active
        ws.title = "AI 분석 결과"
        
        # 기본 정보
        ws['A1'] = f"{company_name} AI 분석 결과"
        ws['A1'].font = Font(bold=True, size=14)
        
        ws['A2'] = f"분석일: {datetime.now().strftime('%Y년 %m월 %d일')}"
        ws['A2'].font = Font(size=10)
        
        ws['A4'] = "종합 분석 결과"
        ws['A4'].font = Font(bold=True, size=12)
        
        ws['A5'] = comprehensive_opinion or f"{company_name}에 대한 AI 분석이 완료되었습니다."
        ws['A5'].alignment = Alignment(wrap_text=True)
        
        # 뉴스 데이터
        ws['A7'] = "뉴스별 분석 결과"
        ws['A7'].font = Font(bold=True, size=12)
        
        # 헤더
        headers = ["뉴스 제목", "출처", "날짜", "감정점수", "수상여부", "투자여부"]
        for col, header in enumerate(headers, 1):
            ws.cell(row=8, column=col, value=header).font = Font(bold=True)
        
        # 데이터
        row = 9
        for news in analyzed_news:
            try:
                news_info = news.get('news_info', {})
                trend_analysis = news.get('trend_analysis', {})
                award_analysis = news.get('award_analysis', {})
                investment_analysis = news.get('investment_analysis', {})
                
                ws.cell(row=row, column=1, value=news_info.get('title', '')[:50])
                ws.cell(row=row, column=2, value=news_info.get('source', ''))
                ws.cell(row=row, column=3, value=news_info.get('published', ''))
                ws.cell(row=row, column=4, value=trend_analysis.get('sentiment_score', 0))
                ws.cell(row=row, column=5, value=award_analysis.get('is_award_related', 'N'))
                ws.cell(row=row, column=6, value=investment_analysis.get('is_investment_related', 'N'))
                row += 1
            except Exception as e:
                print(f"[DEBUG] 뉴스 데이터 처리 중 오류: {str(e)}")
                continue
        
        # 열 너비 조정
        ws.column_dimensions['A'].width = 50
        ws.column_dimensions['B'].width = 20
        ws.column_dimensions['C'].width = 20
        ws.column_dimensions['D'].width = 15
        ws.column_dimensions['E'].width = 15
        ws.column_dimensions['F'].width = 15
        
        # 파일 저장
        wb.save(file_path)
        print(f"[DEBUG] 간단한 엑셀 파일 생성 완료: {file_path}")
        return True
        
    except Exception as e:
        print(f"[DEBUG] 간단한 엑셀 파일 생성 실패: {str(e)}")
        import traceback
        print(f"[DEBUG] 간단한 엑셀 파일 생성 오류 상세: {traceback.format_exc()}")
        return False

def remove_html_tags(text):
    """HTML 태그를 제거하는 함수"""
    import re
    if not text:
        return ""
    
    # <br>, <br/>, <br /> 태그를 줄바꿈으로 변환
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    
    # <p> 태그를 줄바꿈으로 변환
    text = re.sub(r'</p>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<p[^>]*>', '', text, flags=re.IGNORECASE)
    
    # <div> 태그를 줄바꿈으로 변환
    text = re.sub(r'</div>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<div[^>]*>', '', text, flags=re.IGNORECASE)
    
    # 기타 HTML 태그 제거
    clean = re.compile('<.*?>')
    text = re.sub(clean, '', text)
    
    # HTML 엔티티 디코딩
    text = text.replace('&nbsp;', ' ')
    text = text.replace('&amp;', '&')
    text = text.replace('&lt;', '<')
    text = text.replace('&gt;', '>')
    text = text.replace('&quot;', '"')
    text = text.replace('&#39;', "'")
    
    # 연속된 공백 정리 (줄바꿈은 보존)
    lines = text.split('\n')
    cleaned_lines = []
    for line in lines:
        # 각 줄에서 연속된 공백 정리
        cleaned_line = re.sub(r'\s+', ' ', line.strip())
        if cleaned_line:
            cleaned_lines.append(cleaned_line)
    
    # 줄바꿈으로 다시 결합
    result = '\n'.join(cleaned_lines)
    
    return result.strip()

def get_news_source_code(news_info):
    """뉴스 정보에서 분석소스 코드를 추출하는 함수"""
    source = news_info.get('source', '').lower()
    link = news_info.get('link', '').lower()
    
    # 네이버 뉴스 판단
    if 'naver' in source or 'naver' in link:
        return 'N'
    # 구글 뉴스 판단
    elif 'google' in source or 'google' in link:
        return 'G'
    # 기타 소스는 기본값
    else:
        return 'N'  # 기본값으로 네이버로 설정

def convert_date_to_korean(date_str):
    """영어 날짜를 한국 형태로 변환하는 함수"""
    if not date_str:
        return ""
    

    
    try:
        from datetime import datetime
        import pytz
        
        # 다양한 날짜 형식 처리
        date_formats = [
            '%a, %d %b %Y %H:%M:%S %z',  # Fri, 15 Aug 2025 15:02:00 +0000
            '%a, %d %b %Y %H:%M:%S %Z',  # Fri, 15 Aug 2025 15:02:00 UTC
            '%Y-%m-%d %H:%M:%S',         # 2025-08-15 15:02:00
            '%Y-%m-%d',                  # 2025-08-15
            '%d %b %Y',                  # 15 Aug 2025
            '%Y/%m/%d',                  # 2025/08/15
        ]
        
        parsed_date = None
        for fmt in date_formats:
            try:
                parsed_date = datetime.strptime(date_str, fmt)
                break
            except ValueError:
                continue
        
        if parsed_date:
            # 한국 시간대로 변환 (UTC인 경우)
            if parsed_date.tzinfo is None:
                # 시간대 정보가 없으면 한국 시간대로 가정
                kst = pytz.timezone('Asia/Seoul')
                parsed_date = kst.localize(parsed_date)
            else:
                # UTC를 한국 시간대로 변환
                kst = pytz.timezone('Asia/Seoul')
                parsed_date = parsed_date.astimezone(kst)
            
            # 한국 형태로 포맷팅 (YYYY년 MM월 DD일만 표시)
            return parsed_date.strftime('%Y년 %m월 %d일')
        else:
            # 파싱 실패 시 원본 반환
            return date_str
            
    except Exception as e:
        print(f"날짜 변환 오류: {e}, 원본: {date_str}")
        return date_str

@main.route('/api/export/excel', methods=['POST'])
@login_required
def api_export_excel():
    """AI 분석 결과를 엑셀 파일로 다운로드"""
    try:
        data = request.get_json()
        company_name = data.get('company_name', '')
        analyzed_news = data.get('analyzed_news', [])
        comprehensive_opinion = data.get('comprehensive_opinion', '')
        
        # HTML 태그 제거
        comprehensive_opinion_clean = remove_html_tags(comprehensive_opinion)
        
        # 총평 내용을 웹페이지처럼 줄바꿈으로 포맷팅
        def format_comprehensive_opinion(text):
            """총평 내용을 웹페이지처럼 줄바꿈으로 포맷팅"""
            if not text:
                return text
            
            # 특정 패턴을 찾아 줄바꿈 추가
            import re
            
            # "- " 패턴 앞에 줄바꿈 추가
            text = re.sub(r' - ', '\n- ', text)
            
            # "※" 패턴 앞에 줄바꿈 추가
            text = re.sub(r' ※', '\n※', text)
            
            # "동향분석을", "수상실적은", "투자실적은" 패턴 앞에 줄바꿈 추가
            text = re.sub(r' - 동향분석을', '\n- 동향분석을', text)
            text = re.sub(r' - 수상실적은', '\n- 수상실적은', text)
            text = re.sub(r' - 투자실적은', '\n- 투자실적은', text)
            
            # 연속된 줄바꿈 정리
            text = re.sub(r'\n\s*\n', '\n', text)
            
            return text.strip()
        
        comprehensive_opinion_formatted = format_comprehensive_opinion(comprehensive_opinion_clean)
        
        # 엑셀 워크북 생성
        wb = Workbook()
        
        # 첫 번째 시트: 종합 분석 결과
        ws1 = wb.active
        ws1.title = "종합 분석 결과"
        
        # 메인 타이틀 (A, B, C 컬럼 합침)
        ws1['A1'] = f"📊 {company_name} AI 종합 분석 보고서"
        ws1['A1'].font = Font(bold=True, size=16, color="FFFFFF")
        ws1['A1'].alignment = Alignment(horizontal='center', vertical='center')
        ws1['A1'].fill = PatternFill(start_color="2E86AB", end_color="2E86AB", fill_type="solid")  # 진한 파란색 배경
        ws1.merge_cells('A1:C1')
        ws1.row_dimensions[1].height = 35
        
        # 분석 날짜 정보
        from datetime import datetime
        current_date = datetime.now().strftime("%Y년 %m월 %d일")
        ws1['A2'] = f"📅 분석일: {current_date}"
        ws1['A2'].font = Font(size=10, color="666666")
        ws1['A2'].alignment = Alignment(horizontal='right')
        ws1.merge_cells('A2:C2')
        ws1.row_dimensions[2].height = 20
        
        # 총평 섹션 헤더
        ws1['A4'] = "🔍 종합 분석 결과"
        ws1['A4'].font = Font(bold=True, size=14, color="FFFFFF")
        ws1['A4'].alignment = Alignment(horizontal='center', vertical='center')
        ws1['A4'].fill = PatternFill(start_color="A23B72", end_color="A23B72", fill_type="solid")  # 보라색 배경
        ws1.merge_cells('A4:C4')
        ws1.row_dimensions[4].height = 30
        
        # 종합 분석 결과 헤더에 테두리 추가
        from openpyxl.styles import Border, Side
        thin_border = Border(left=Side(style='thin'), right=Side(style='thin'), 
                           top=Side(style='thin'), bottom=Side(style='thin'))
        ws1['A4'].border = thin_border
        
        # 총평 내용 (A, B, C 컬럼 합쳐서 표시)
        ws1['A5'] = comprehensive_opinion_formatted
        ws1['A5'].font = Font(size=11)
        ws1['A5'].alignment = Alignment(wrap_text=True, vertical='top', horizontal='left')
        ws1['A5'].fill = PatternFill(start_color="F8F9FA", end_color="F8F9FA", fill_type="solid")  # 연한 회색 배경
        ws1.merge_cells('A5:C5')  # A, B, C 컬럼 합침
        
        # 종합 분석 결과 내용에 테두리 추가 (병합된 셀의 모든 경계에 적용)
        for col in ['A', 'B', 'C']:
            ws1[f'{col}5'].border = thin_border
        
        # 총평 내용의 높이 계산 및 설정
        opinion_lines = len(comprehensive_opinion_formatted.split('\n')) + comprehensive_opinion_formatted.count('.') // 2
        opinion_height = max(opinion_lines, 10)  # 최소 10줄 높이
        
        # 총평 셀의 높이 설정
        ws1.row_dimensions[5].height = opinion_height * 16  # 16포인트씩 높이 설정
        
        # 통계 정보 계산
        def calculate_statistics():
            """뉴스 분석 결과에서 통계 정보 계산"""
            total_news = len(analyzed_news)
            
            # 평균 긍정/부정 점수 계산
            sentiment_scores = []
            for news in analyzed_news:
                trend_analysis = news.get('trend_analysis', {})
                score = trend_analysis.get('sentiment_score', 0)
                if score is not None:
                    sentiment_scores.append(score)
            
            avg_sentiment = sum(sentiment_scores) / len(sentiment_scores) if sentiment_scores else 0
            
            # 총평 내용에서 수상실적과 투자실적 건수 추출
            def extract_counts_from_opinion(opinion_text):
                """총평 내용에서 수상실적과 투자실적 건수 추출"""
                import re
                
                award_count = 0
                investment_count = 0
                
                # 수상실적 패턴 찾기
                award_patterns = [
                    r'수상실적은\s*(\d+)건',
                    r'수상실적\s*(\d+)건',
                    r'수상\s*(\d+)건'
                ]
                
                for pattern in award_patterns:
                    match = re.search(pattern, opinion_text)
                    if match:
                        award_count = int(match.group(1))
                        break
                
                # 투자실적 패턴 찾기
                investment_patterns = [
                    r'투자실적은\s*(\d+)건',
                    r'투자실적\s*(\d+)건',
                    r'투자\s*(\d+)건'
                ]
                
                for pattern in investment_patterns:
                    match = re.search(pattern, opinion_text)
                    if match:
                        investment_count = int(match.group(1))
                        break
                
                return award_count, investment_count
            
            # 총평에서 건수 추출
            award_count, investment_count = extract_counts_from_opinion(comprehensive_opinion_formatted)
            
            # 통계 정보 출력 (디버깅용)
            print(f"전체 뉴스 수: {total_news}")
            print(f"총평에서 추출한 수상실적 건수: {award_count}")
            print(f"총평에서 추출한 투자실적 건수: {investment_count}")
            print(f"평균 감정점수: {avg_sentiment}")
            
            return {
                'total_news': total_news,
                'avg_sentiment': round(avg_sentiment, 1),
                'award_count': award_count,
                'investment_count': investment_count
            }
        
        # 통계 정보 계산
        stats = calculate_statistics()
        
        # 통계 정보 표시 (총평 아래)
        stats_row = 7
        ws1[f'A{stats_row}'] = "📈 핵심 지표 요약"
        ws1[f'A{stats_row}'].font = Font(bold=True, size=13, color="FFFFFF")
        ws1[f'A{stats_row}'].alignment = Alignment(horizontal='center', vertical='center')
        ws1[f'A{stats_row}'].fill = PatternFill(start_color="F18F01", end_color="F18F01", fill_type="solid")  # 주황색 배경
        ws1.merge_cells(f'A{stats_row}:C{stats_row}')
        ws1.row_dimensions[stats_row].height = 28
        
        # 핵심 지표 요약 헤더에 테두리 추가
        from openpyxl.styles import Border, Side
        thin_border = Border(left=Side(style='thin'), right=Side(style='thin'), 
                           top=Side(style='thin'), bottom=Side(style='thin'))
        ws1[f'A{stats_row}'].border = thin_border
        
        # 통계 카드 스타일로 표시
        stats_row += 1
        
        # 헤더 행 (평균 감정점수, 수상실적, 투자실적)
        ws1[f'A{stats_row}'] = "💭 평균 감정점수"
        ws1[f'A{stats_row}'].font = Font(bold=True, size=11, color="FFFFFF")
        ws1[f'A{stats_row}'].alignment = Alignment(horizontal='center', vertical='center')
        ws1[f'A{stats_row}'].fill = PatternFill(start_color="2196F3", end_color="2196F3", fill_type="solid")  # 파란색
        ws1[f'A{stats_row}'].border = thin_border
        
        ws1[f'B{stats_row}'] = "🏆 수상실적"
        ws1[f'B{stats_row}'].font = Font(bold=True, size=11, color="FFFFFF")
        ws1[f'B{stats_row}'].alignment = Alignment(horizontal='center', vertical='center')
        ws1[f'B{stats_row}'].fill = PatternFill(start_color="4CAF50", end_color="4CAF50", fill_type="solid")  # 초록색
        ws1[f'B{stats_row}'].border = thin_border
        
        ws1[f'C{stats_row}'] = "💰 투자실적"
        ws1[f'C{stats_row}'].font = Font(bold=True, size=11, color="FFFFFF")
        ws1[f'C{stats_row}'].alignment = Alignment(horizontal='center', vertical='center')
        ws1[f'C{stats_row}'].fill = PatternFill(start_color="9C27B0", end_color="9C27B0", fill_type="solid")  # 보라색
        ws1[f'C{stats_row}'].border = thin_border
        
        ws1.row_dimensions[stats_row].height = 25
        
        # 값 행
        stats_row += 1
        
        # 감정점수에 따른 색상 설정
        sentiment_score = stats['avg_sentiment']
        if sentiment_score > 0:
            score_color = "2196F3"  # 파란색 (긍정)
        elif sentiment_score < 0:
            score_color = "F44336"  # 빨간색 (부정)
        else:
            score_color = "9E9E9E"  # 회색 (중립)
        
        ws1[f'A{stats_row}'] = f"{sentiment_score:+.1f}"
        ws1[f'A{stats_row}'].font = Font(bold=True, size=16, color=score_color)
        ws1[f'A{stats_row}'].alignment = Alignment(horizontal='center', vertical='center')
        ws1[f'A{stats_row}'].fill = PatternFill(start_color="F8F9FA", end_color="F8F9FA", fill_type="solid")  # 연한 회색 배경
        ws1[f'A{stats_row}'].border = thin_border
        
        ws1[f'B{stats_row}'] = f"{stats['award_count']}"
        ws1[f'B{stats_row}'].font = Font(bold=True, size=16, color="4CAF50")
        ws1[f'B{stats_row}'].alignment = Alignment(horizontal='center', vertical='center')
        ws1[f'B{stats_row}'].fill = PatternFill(start_color="F8F9FA", end_color="F8F9FA", fill_type="solid")  # 연한 회색 배경
        ws1[f'B{stats_row}'].border = thin_border
        
        ws1[f'C{stats_row}'] = f"{stats['investment_count']}"
        ws1[f'C{stats_row}'].font = Font(bold=True, size=16, color="9C27B0")
        ws1[f'C{stats_row}'].alignment = Alignment(horizontal='center', vertical='center')
        ws1[f'C{stats_row}'].fill = PatternFill(start_color="F8F9FA", end_color="F8F9FA", fill_type="solid")  # 연한 회색 배경
        ws1[f'C{stats_row}'].border = thin_border
        
        ws1.row_dimensions[stats_row].height = 35
        
        # 뉴스별 긍정/부정 점수 분석 (통계 정보 아래)
        chart_start_row = stats_row + 4
        
        # 차트 헤더
        ws1[f'A{chart_start_row}'] = "뉴스별 긍정/부정 점수 분석"
        ws1[f'A{chart_start_row}'].font = Font(bold=True, size=12)
        ws1[f'A{chart_start_row}'].alignment = Alignment(horizontal='left')
        ws1[f'A{chart_start_row}'].fill = PatternFill(start_color="E6E6E6", end_color="E6E6E6", fill_type="solid")  # 회색 배경
        
        # 날짜 기준으로 뉴스 정렬
        def parse_date_for_sorting(date_str):
            """날짜 문자열을 파싱하여 정렬용 datetime 객체 반환"""
            if not date_str:
                return datetime.min
            
            try:
                from datetime import datetime
                import pytz
                
                # 다양한 날짜 형식 처리
                date_formats = [
                    '%a, %d %b %Y %H:%M:%S %z',  # Fri, 15 Aug 2025 15:02:00 +0000
                    '%a, %d %b %Y %H:%M:%S %Z',  # Fri, 15 Aug 2025 15:02:00 UTC
                    '%Y-%m-%d %H:%M:%S',         # 2025-08-15 15:02:00
                    '%Y-%m-%d',                  # 2025-08-15
                    '%d %b %Y',                  # 15 Aug 2025
                    '%Y/%m/%d',                  # 2025/08/15
                ]
                
                for fmt in date_formats:
                    try:
                        return datetime.strptime(date_str, fmt)
                    except ValueError:
                        continue
                
                return datetime.min
            except:
                return datetime.min
        
        # 뉴스를 날짜순으로 정렬 (오래된 날짜부터)
        sorted_news = sorted(analyzed_news, key=lambda x: parse_date_for_sorting(x.get('news_info', {}).get('published', '')))
        
        # 차트 데이터 헤더
        ws1[f'A{chart_start_row + 2}'] = "날짜"
        ws1[f'B{chart_start_row + 2}'] = "뉴스 제목"
        ws1[f'C{chart_start_row + 2}'] = "긍정/부정 점수 (-10~10)"
        ws1[f'D{chart_start_row + 2}'] = "감정 라벨"
        
        # 헤더 스타일
        from openpyxl.styles import Border, Side
        thin_border = Border(left=Side(style='thin'), right=Side(style='thin'), 
                           top=Side(style='thin'), bottom=Side(style='thin'))
        
        for col in ['A', 'B', 'C', 'D']:
            cell = ws1[f'{col}{chart_start_row + 2}']
            cell.font = Font(bold=True)
            cell.fill = PatternFill(start_color="E6E6E6", end_color="E6E6E6", fill_type="solid")
            cell.alignment = Alignment(horizontal='center', vertical='center')
            cell.border = thin_border
        
        # 차트 데이터 입력 (날짜순으로 정렬된 뉴스)
        chart_data_row = chart_start_row + 3
        for i, news in enumerate(sorted_news):
            news_info = news.get('news_info', {})
            trend_analysis = news.get('trend_analysis', {})
            
            # 날짜 (한국식 형태)
            published_date = news_info.get('published', '')
            short_date = convert_date_to_korean(published_date)
            
            # 뉴스 제목 (짧게)
            title = remove_html_tags(news_info.get('title', ''))
            if len(title) > 40:
                title = title[:37] + "..."
            
            # 점수와 라벨
            score = trend_analysis.get('sentiment_score', 0)
            label = remove_html_tags(trend_analysis.get('sentiment_label', ''))
            
            ws1[f'A{chart_data_row + i}'] = short_date
            ws1[f'B{chart_data_row + i}'] = title
            ws1[f'C{chart_data_row + i}'] = score
            ws1[f'D{chart_data_row + i}'] = label
            
            # 점수에 따른 색상 설정
            score_cell = ws1[f'C{chart_data_row + i}']
            if score > 0:
                score_cell.fill = PatternFill(start_color="90EE90", end_color="90EE90", fill_type="solid")  # 연한 초록
            elif score < 0:
                score_cell.fill = PatternFill(start_color="FFB6C1", end_color="FFB6C1", fill_type="solid")  # 연한 빨강
            else:
                score_cell.fill = PatternFill(start_color="F0F0F0", end_color="F0F0F0", fill_type="solid")  # 회색
            
            # 데이터 셀에 테두리 추가
            from openpyxl.styles import Border, Side
            thin_border = Border(left=Side(style='thin'), right=Side(style='thin'), 
                               top=Side(style='thin'), bottom=Side(style='thin'))
            
            for col in ['A', 'B', 'C', 'D']:
                ws1[f'{col}{chart_data_row + i}'].border = thin_border
        
        # 열 너비 조정
        ws1.column_dimensions['A'].width = 35  # 날짜 (한국식 날짜 형식에 맞게 늘림)
        ws1.column_dimensions['B'].width = 60  # 뉴스 제목
        ws1.column_dimensions['C'].width = 20  # 점수 (너비 증가)
        ws1.column_dimensions['D'].width = 15  # 라벨
        
        # 차트 생성 (데이터 바로 옆에 배치)
        try:
            from openpyxl.chart import LineChart, Reference
            
            # 차트 데이터 범위 설정
            data_start_row = chart_start_row + 2
            data_end_row = chart_data_row + len(sorted_news) - 1
            
            # 차트 생성
            chart = LineChart()
            chart.title = f"{company_name} 뉴스별 긍정/부정 점수 (시간순)"
            chart.style = 10
            chart.x_axis.title = "날짜"
            chart.y_axis.title = "긍정/부정 점수"
            
            # 데이터 범위 설정 (점수 데이터)
            data = Reference(ws1, min_col=3, min_row=data_start_row, max_row=data_end_row)
            # 카테고리 범위 설정 (날짜)
            cats = Reference(ws1, min_col=1, min_row=data_start_row + 1, max_row=data_end_row)
            
            chart.add_data(data, titles_from_data=True)
            chart.set_categories(cats)
            
            # 차트 크기 및 위치 설정 (데이터 바로 옆)
            chart.width = 15
            chart.height = 10
            
            # 차트를 시트에 추가 (데이터 바로 옆, F열부터, 두 줄 아래)
            ws1.add_chart(chart, f"F{chart_start_row + 2}")
            
            # 2. 수상실적 표 생성
            try:
                # 수상실적 데이터 준비 (실적이 있는 뉴스만 필터링)
                award_events = []
                
                for news in analyzed_news:
                    news_info = news.get('news_info', {})
                    award_analysis = news.get('award_analysis', {})
                    
                    if award_analysis.get('is_award_related') == 'Y':
                        award_events.append({
                            'date': convert_date_to_korean(news_info.get('published', '')),
                            'award_name': remove_html_tags(award_analysis.get('award_name', ''))
                        })
                
                if award_events:
                    # 수상실적 표 데이터를 첫 번째 시트에 추가
                    award_table_start_row = chart_start_row + 15
                    
                    # 수상실적 표 헤더
                    ws1[f'A{award_table_start_row}'] = "🏆 수상실적"
                    ws1[f'A{award_table_start_row}'].font = Font(bold=True, size=12, color="FFFFFF")
                    ws1[f'A{award_table_start_row}'].fill = PatternFill(start_color="FF6B35", end_color="FF6B35", fill_type="solid")
                    ws1[f'A{award_table_start_row}'].alignment = Alignment(horizontal='center', vertical='center')
                    ws1.merge_cells(f'A{award_table_start_row}:B{award_table_start_row}')
                    ws1.row_dimensions[award_table_start_row].height = 25
                    
                    # 수상실적 표 컬럼 헤더
                    ws1[f'A{award_table_start_row + 1}'] = "날짜"
                    ws1[f'B{award_table_start_row + 1}'] = "수상실적명"
                    ws1[f'A{award_table_start_row + 1}'].font = Font(bold=True)
                    ws1[f'B{award_table_start_row + 1}'].font = Font(bold=True)
                    ws1[f'A{award_table_start_row + 1}'].fill = PatternFill(start_color="F0F0F0", end_color="F0F0F0", fill_type="solid")
                    ws1[f'B{award_table_start_row + 1}'].fill = PatternFill(start_color="F0F0F0", end_color="F0F0F0", fill_type="solid")
                    
                    # 수상실적 데이터 입력
                    for i, event in enumerate(award_events, 1):
                        ws1[f'A{award_table_start_row + 1 + i}'] = event['date']
                        ws1[f'B{award_table_start_row + 1 + i}'] = event['award_name']
                    
                    # 표 테두리 설정
                    from openpyxl.styles import Border, Side
                    thin_border = Border(left=Side(style='thin'), right=Side(style='thin'), 
                                       top=Side(style='thin'), bottom=Side(style='thin'))
                    
                    for row in range(award_table_start_row + 1, award_table_start_row + 2 + len(award_events)):
                        for col in ['A', 'B']:
                            ws1[f'{col}{row}'].border = thin_border
                    
                    # 컬럼 너비 설정
                    ws1.column_dimensions['A'].width = 35  # 날짜
                    ws1.column_dimensions['B'].width = 50  # 수상실적명
                    
                    investment_table_start_row = award_table_start_row + 3 + len(award_events)
                else:
                    investment_table_start_row = chart_start_row + 15
                
            except Exception as e:
                print(f"수상실적 표 생성 중 오류: {e}")
                investment_table_start_row = chart_start_row + 15
            
            # 3. 투자실적 표 생성
            try:
                # 투자실적 데이터 준비 (실적이 있는 뉴스만 필터링)
                investment_events = []
                
                for news in analyzed_news:
                    news_info = news.get('news_info', {})
                    investment_analysis = news.get('investment_analysis', {})
                    
                    if investment_analysis.get('is_investment_related') == 'Y':
                        investment_events.append({
                            'date': convert_date_to_korean(news_info.get('published', '')),
                            'investment_name': remove_html_tags(investment_analysis.get('investment_name', ''))
                        })
                
                if investment_events:
                    # 투자실적 표 데이터를 첫 번째 시트에 추가
                    investment_table_start_row = max(investment_table_start_row, chart_start_row + 15)
                    
                    # 투자실적 표 헤더
                    ws1[f'A{investment_table_start_row}'] = "💰 투자실적"
                    ws1[f'A{investment_table_start_row}'].font = Font(bold=True, size=12, color="FFFFFF")
                    ws1[f'A{investment_table_start_row}'].fill = PatternFill(start_color="28A745", end_color="28A745", fill_type="solid")
                    ws1[f'A{investment_table_start_row}'].alignment = Alignment(horizontal='center', vertical='center')
                    ws1.merge_cells(f'A{investment_table_start_row}:B{investment_table_start_row}')
                    ws1.row_dimensions[investment_table_start_row].height = 25
                    
                    # 투자실적 표 컬럼 헤더
                    ws1[f'A{investment_table_start_row + 1}'] = "날짜"
                    ws1[f'B{investment_table_start_row + 1}'] = "투자실적명"
                    ws1[f'A{investment_table_start_row + 1}'].font = Font(bold=True)
                    ws1[f'B{investment_table_start_row + 1}'].font = Font(bold=True)
                    ws1[f'A{investment_table_start_row + 1}'].fill = PatternFill(start_color="F0F0F0", end_color="F0F0F0", fill_type="solid")
                    ws1[f'B{investment_table_start_row + 1}'].fill = PatternFill(start_color="F0F0F0", end_color="F0F0F0", fill_type="solid")
                    
                    # 투자실적 데이터 입력
                    for i, event in enumerate(investment_events, 1):
                        ws1[f'A{investment_table_start_row + 1 + i}'] = event['date']
                        ws1[f'B{investment_table_start_row + 1 + i}'] = event['investment_name']
                    
                    # 표 테두리 설정
                    from openpyxl.styles import Border, Side
                    thin_border = Border(left=Side(style='thin'), right=Side(style='thin'), 
                                       top=Side(style='thin'), bottom=Side(style='thin'))
                    
                    for row in range(investment_table_start_row + 1, investment_table_start_row + 2 + len(investment_events)):
                        for col in ['A', 'B']:
                            ws1[f'{col}{row}'].border = thin_border
                    
                    # 컬럼 너비 설정
                    ws1.column_dimensions['A'].width = 35  # 날짜
                    ws1.column_dimensions['B'].width = 50  # 투자실적명
                    
            except Exception as e:
                print(f"투자실적 표 생성 중 오류: {e}")
            
        except Exception as e:
            print(f"차트 생성 중 오류: {e}")
            # 차트 생성 실패 시에도 계속 진행
        
        # 두 번째 시트: 뉴스별 분석 결과
        ws2 = wb.create_sheet("뉴스별 분석 결과")
        
        # 헤더 설정
        headers = [
            '분석소스', '뉴스 제목', '언론사', '날짜', '링크',
            '동향분석내용', '동향분석점수', '동향분석라벨',
            '수상실적여부', '수상실적명', '수상실적 검토 이유',
            '투자실적여부', '투자실적명', '투자실적 검토 이유'
        ]
        
        # 테두리 스타일 정의
        from openpyxl.styles import Border, Side
        thin_border = Border(left=Side(style='thin'), right=Side(style='thin'), 
                           top=Side(style='thin'), bottom=Side(style='thin'))
        
        for col, header in enumerate(headers, 1):
            cell = ws2.cell(row=1, column=col, value=header)
            cell.font = Font(bold=True)
            cell.fill = PatternFill(start_color="CCCCCC", end_color="CCCCCC", fill_type="solid")
            cell.alignment = Alignment(horizontal='center', vertical='center')
            cell.border = thin_border
        
        # 데이터 입력
        for row, news in enumerate(analyzed_news, 2):
            news_info = news.get('news_info', {})
            trend_analysis = news.get('trend_analysis', {})
            award_analysis = news.get('award_analysis', {})
            investment_analysis = news.get('investment_analysis', {})
            
            # 분석소스 코드 추출
            source_code = get_news_source_code(news_info)
            
            ws2.cell(row=row, column=1, value=source_code)  # 분석소스
            ws2.cell(row=row, column=2, value=remove_html_tags(news_info.get('title', '')))  # 뉴스 제목
            ws2.cell(row=row, column=3, value=remove_html_tags(news_info.get('source', '')))  # 언론사
            ws2.cell(row=row, column=4, value=convert_date_to_korean(news_info.get('published', '')))  # 날짜
            ws2.cell(row=row, column=5, value=remove_html_tags(news_info.get('link', '')))  # 링크
            ws2.cell(row=row, column=6, value=remove_html_tags(trend_analysis.get('news_trend_summary', '')))  # 동향분석내용
            ws2.cell(row=row, column=7, value=trend_analysis.get('sentiment_score', ''))  # 동향분석점수
            ws2.cell(row=row, column=8, value=remove_html_tags(trend_analysis.get('sentiment_label', '')))  # 동향분석라벨
            ws2.cell(row=row, column=9, value=award_analysis.get('is_award_related', ''))  # 수상실적여부
            ws2.cell(row=row, column=10, value=remove_html_tags(award_analysis.get('award_name', '')))  # 수상실적명
            ws2.cell(row=row, column=11, value=remove_html_tags(award_analysis.get('award_reason', '')))  # 수상실적 검토 이유
            ws2.cell(row=row, column=12, value=investment_analysis.get('is_investment_related', ''))  # 투자실적여부
            ws2.cell(row=row, column=13, value=remove_html_tags(investment_analysis.get('investment_name', '')))  # 투자실적명
            ws2.cell(row=row, column=14, value=remove_html_tags(investment_analysis.get('investment_reason', '')))  # 투자실적 검토 이유
            
            # 데이터 행에 테두리 추가
            for col in range(1, 15):  # 1부터 14까지 (14개 컬럼)
                ws2.cell(row=row, column=col).border = thin_border
        
        # 열 너비 자동 조정 (병합된 셀 고려)
        for col_num in range(1, ws2.max_column + 1):
            max_length = 0
            column_letter = get_column_letter(col_num)
            
            for row_num in range(1, ws2.max_row + 1):
                cell = ws2.cell(row=row_num, column=col_num)
                try:
                    if cell.value and len(str(cell.value)) > max_length:
                        max_length = len(str(cell.value))
                except:
                    pass
            
            adjusted_width = min(max_length + 2, 50)  # 최대 50자로 제한
            ws2.column_dimensions[column_letter].width = adjusted_width
        
        # 파일명 생성 (사용자 아이디 포함)
        user_email = session.get('user_email', '')
        user_id = session.get('user_id', '')
        print(f"[DEBUG] 엑셀 저장 API - 세션에서 가져온 user_email: {user_email}")
        print(f"[DEBUG] 엑셀 저장 API - 세션에서 가져온 user_id: {user_id}")
        
        # 사용자 이메일이 없으면 데이터베이스에서 조회
        if not user_email and user_id:
            try:
                from app.models import User
                user = User.query.get(user_id)
                if user:
                    user_email = user.email
                    print(f"[DEBUG] 엑셀 저장 API - 데이터베이스에서 조회한 user_email: {user_email}")
            except Exception as e:
                print(f"[DEBUG] 엑셀 저장 API - 사용자 조회 중 오류: {str(e)}")
        
        user_id_part = user_email.split('@')[0] if '@' in user_email else 'unknown'
        timestamp = datetime.now().strftime("%Y%m%d_%H%M")
        filename = f"{user_id_part}_{company_name}_AI분석결과_{timestamp}.xlsx"
        print(f"[DEBUG] 엑셀 저장 API - 최종 생성된 파일명: {filename}")
        print(f"[DEBUG] 엑셀 저장 API - user_id_part: {user_id_part}")
        print(f"[DEBUG] 엑셀 저장 API - 타임스탬프 형식: {timestamp}")
        
        # 임시 파일로 엑셀 생성
        temp_dir = tempfile.gettempdir()
        temp_path = os.path.join(temp_dir, filename)
        
        # 공통 엑셀 생성 함수 사용
        create_excel_file(company_name, analyzed_news, comprehensive_opinion, temp_path)
        
        # 파일 다운로드 후 임시 파일 삭제
        def cleanup_temp_file():
            try:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
            except:
                pass
        
        response = send_file(
            temp_path,
            as_attachment=True,
            download_name=filename,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        
        # 응답 완료 후 임시 파일 삭제
        response.call_on_close(cleanup_temp_file)
        
        return response
        
    except Exception as e:
        import traceback
        print(f"엑셀 저장 중 오류: {str(e)}")
        print("상세 에러 정보:")
        traceback.print_exc()
        return jsonify({"error": f"엑셀 저장 중 오류가 발생했습니다: {str(e)}"}), 500

@main.route('/api/send/email', methods=['POST'])
@login_required
def api_send_email():
    """AI 분석 결과를 이메일로 발송"""
    try:
        data = request.get_json()
        company_name = data.get('company_name')
        analyzed_news = data.get('analyzed_news')
        comprehensive_opinion = data.get('comprehensive_opinion')
        
        if not company_name or not analyzed_news:
            return jsonify({"error": "필수 데이터가 누락되었습니다."}), 400
        
        # 현재 로그인한 사용자의 이메일 가져오기
        user_email = session.get('user_email')
        if not user_email:
            return jsonify({"error": "사용자 이메일 정보를 찾을 수 없습니다."}), 400
        
        # 임시 엑셀 파일 생성 (사용자 아이디 포함)
        temp_dir = tempfile.gettempdir()
        user_id_part = user_email.split('@')[0] if '@' in user_email else 'unknown'
        timestamp = datetime.now().strftime('%Y%m%d_%H%M')
        excel_filename = f"{user_id_part}_{company_name}_AI분석결과_{timestamp}.xlsx"
        excel_path = os.path.join(temp_dir, excel_filename)
        
        # 공통 엑셀 생성 함수 사용
        create_excel_file(company_name, analyzed_news, comprehensive_opinion, excel_path)
        
        # 이메일 발송
        email_service = EmailService()
        result = email_service.send_analysis_report(user_email, company_name, excel_path)
        
        # 임시 파일 삭제
        try:
            os.remove(excel_path)
        except:
            pass
        
        if result['success']:
            return jsonify({
                "success": True,
                "message": result['message']
            }), 200
        else:
            return jsonify({
                "success": False,
                "error": result['message']
            }), 500
            
    except Exception as e:
        print(f"이메일 발송 중 오류: {str(e)}")
        return jsonify({"error": f"이메일 발송 중 오류가 발생했습니다: {str(e)}"}), 500

# 인증 관련 라우트
@main.route('/auth/register', methods=['GET', 'POST'])
def auth_register():
    """회원가입"""
    if request.method == 'GET':
        return render_template('auth/register.html')
    
    try:
        data = request.get_json()
        email = data.get('email', '').strip()
        password = data.get('password', '')
        
        # 이메일 검증
        is_valid_email, email_result = User.validate_email(email)
        if not is_valid_email:
            return jsonify({"error": email_result}), 400
        
        # 비밀번호 검증
        is_valid_password, password_result = User.validate_password(password)
        if not is_valid_password:
            return jsonify({"error": password_result}), 400
        
        # 이메일 중복 확인
        existing_user = User.query.filter_by(email=email_result).first()
        if existing_user:
            return jsonify({"error": "이미 등록된 이메일 주소입니다."}), 400
        
        # 사용자 생성
        user = User(email=email_result, password=password_result)
        db.session.add(user)
        db.session.commit()
        
        return jsonify({
            "message": "회원가입이 완료되었습니다.",
            "user": user.to_dict()
        }), 201
        
    except Exception as e:
        db.session.rollback()
        import traceback
        print(f"회원가입 오류: {str(e)}")
        print(f"오류 상세: {traceback.format_exc()}")
        return jsonify({"error": f"회원가입 중 오류가 발생했습니다: {str(e)}"}), 500

@main.route('/auth/login', methods=['GET', 'POST'])
def auth_login():
    """로그인"""
    if request.method == 'GET':
        return render_template('auth/login.html')
    
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')
        
        if not email or not password:
            return jsonify({"error": "이메일과 비밀번호를 입력해주세요."}), 400
        
        # 사용자 조회
        user = User.query.filter_by(email=email).first()
        if not user or not user.check_password(password):
            return jsonify({"error": "이메일 또는 비밀번호가 올바르지 않습니다."}), 401
        
        if not user.is_active:
            return jsonify({"error": "비활성화된 계정입니다."}), 401
        
        # 세션에 사용자 정보 저장
        session['user_id'] = user.id
        session['user_email'] = user.email
        
        return jsonify({
            "message": "로그인이 완료되었습니다.",
            "user": user.to_dict()
        }), 200
        
    except Exception as e:
        print(f"로그인 오류: {str(e)}")
        return jsonify({"error": "로그인 중 오류가 발생했습니다."}), 500

@main.route('/auth/logout', methods=['POST'])
def auth_logout():
    """로그아웃"""
    try:
        session.clear()
        return jsonify({"message": "로그아웃이 완료되었습니다."}), 200
    except Exception as e:
        print(f"로그아웃 오류: {str(e)}")
        return jsonify({"error": "로그아웃 중 오류가 발생했습니다."}), 500

@main.route('/auth/reset-password', methods=['GET', 'POST'])
def auth_reset_password():
    """비밀번호 초기화"""
    if request.method == 'GET':
        return render_template('auth/reset_password.html')
    
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        
        # 이메일 검증
        is_valid_email, email_result = User.validate_email(email)
        if not is_valid_email:
            return jsonify({"error": email_result}), 400
        
        # 사용자 조회
        user = User.query.filter_by(email=email_result).first()
        if not user:
            return jsonify({"error": "등록되지 않은 이메일 주소입니다."}), 404
        
        if not user.is_active:
            return jsonify({"error": "비활성화된 계정입니다."}), 400
        
        # 임시 비밀번호 생성 (이메일 주소 기반)
        temp_password = email_result.split('@')[0] + "123!"
        
        # 비밀번호 초기화
        user.reset_password(temp_password)
        db.session.commit()
        
        return jsonify({
            "message": "비밀번호가 초기화되었습니다.",
            "temp_password": temp_password
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"비밀번호 초기화 오류: {str(e)}")
        return jsonify({"error": "비밀번호 초기화 중 오류가 발생했습니다."}), 500

@main.route('/auth/change-password', methods=['GET', 'POST'])
@login_required
def auth_change_password():
    """비밀번호 변경"""
    if request.method == 'GET':
        return render_template('auth/change_password.html')
    
    try:
        data = request.get_json()
        current_password = data.get('current_password', '')
        new_password = data.get('new_password', '')
        confirm_password = data.get('confirm_password', '')
        
        if not current_password or not new_password or not confirm_password:
            return jsonify({"error": "모든 필드를 입력해주세요."}), 400
        
        # 새 비밀번호 확인
        if new_password != confirm_password:
            return jsonify({"error": "새 비밀번호가 일치하지 않습니다."}), 400
        
        # 새 비밀번호 검증
        is_valid_password, password_result = User.validate_password(new_password)
        if not is_valid_password:
            return jsonify({"error": password_result}), 400
        
        # 현재 사용자 조회
        user = User.query.get(session['user_id'])
        if not user:
            return jsonify({"error": "사용자를 찾을 수 없습니다."}), 404
        
        # 현재 비밀번호 확인
        if not user.check_password(current_password):
            return jsonify({"error": "현재 비밀번호가 올바르지 않습니다."}), 401
        
        # 비밀번호 변경
        user.set_password(password_result)
        db.session.commit()
        
        return jsonify({"message": "비밀번호가 변경되었습니다."}), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"비밀번호 변경 오류: {str(e)}")
        return jsonify({"error": "비밀번호 변경 중 오류가 발생했습니다."}), 500

@main.route('/auth/profile', methods=['GET'])
@login_required
def auth_profile():
    """사용자 프로필 조회"""
    try:
        user = User.query.get(session['user_id'])
        if not user:
            return jsonify({"error": "사용자를 찾을 수 없습니다."}), 404
        
        return jsonify({"user": user.to_dict()}), 200
        
    except Exception as e:
        print(f"프로필 조회 오류: {str(e)}")
        return jsonify({"error": "프로필 조회 중 오류가 발생했습니다."}), 500


# 공개자료실 관련 라우트
@main.route('/api/archive')
@login_required
def api_archive_list():
    """모든 사용자의 공개자료실 목록 조회 (게시판 형태)"""
    try:
        print(f"[DEBUG] 공개자료실 API 호출됨")
        page = request.args.get('page', 1, type=int)
        per_page = 7  # 한 페이지당 7개씩
        
        print(f"[DEBUG] 페이지: {page}, per_page: {per_page}")
        
        # 전체 아카이브 수 조회 (모든 사용자)
        total_archives = Archive.query.count()
        print(f"[DEBUG] 전체 아카이브 수: {total_archives}")
        
        # 페이지네이션으로 아카이브 조회 (모든 사용자)
        archives = Archive.query\
            .order_by(Archive.created_at.desc())\
            .offset((page - 1) * per_page)\
            .limit(per_page)\
            .all()
        
        print(f"[DEBUG] 조회된 아카이브 수: {len(archives)}")
        for i, archive in enumerate(archives):
            print(f"[DEBUG] 아카이브 {i+1}: ID={archive.id}, 파일명={archive.original_filename}, 회사={archive.company_name}")
        
        # 총 페이지 수 계산
        total_pages = (total_archives + per_page - 1) // per_page
        
        # 현재 로그인한 사용자 정보 가져오기
        current_user_id = session.get('user_id')
        current_user = User.query.get(current_user_id) if current_user_id else None
        is_admin = current_user.is_admin() if current_user else False
        
        # 디버그 로그를 파일에 기록
        with open('/home/kca1000plus/bangsong/news-homepage/debug.log', 'a') as f:
            f.write(f"[ARCHIVE_LIST] session 내용: {dict(session)}\n")
            f.write(f"[ARCHIVE_LIST] current_user_id: {current_user_id}\n")
            f.write(f"[ARCHIVE_LIST] is_admin: {is_admin}\n")
            f.write(f"[ARCHIVE_LIST] 아카이브 수: {len(archives)}\n")
            for i, archive in enumerate(archives):
                f.write(f"[ARCHIVE_LIST] 아카이브 {i+1}: ID={archive.id}, user_id={archive.user_id}, 회사={archive.company_name}\n")
            f.flush()
        
        # 각 아카이브에 삭제 가능 여부 추가
        archive_list = []
        for archive in archives:
            archive_dict = archive.to_dict()
            # 본인의 파일이거나 관리자인 경우 삭제 가능
            archive_dict['can_delete'] = (archive.user_id == current_user_id) or is_admin
            archive_list.append(archive_dict)
        
        result = {
            "archives": archive_list,
            "pagination": {
                "current_page": page,
                "total_pages": total_pages,
                "total_items": total_archives,
                "per_page": per_page
            },
            "current_user_id": current_user_id,  # 현재 사용자 ID
            "is_admin": is_admin  # 관리자 여부 추가
        }
        
        print(f"[DEBUG] 반환할 결과: {result}")
        return jsonify(result)
    except Exception as e:
        print(f"[DEBUG] 공개자료실 API 오류: {str(e)}")
        import traceback
        print(f"[DEBUG] 공개자료실 API 오류 상세: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


@main.route('/api/archive/<int:archive_id>/download')
def api_archive_download(archive_id):
    """공개자료실 파일 다운로드"""
    try:
        # 로그 파일에 직접 기록
        with open('/home/kca1000plus/bangsong/news-homepage/debug.log', 'a') as f:
            f.write(f"[ARCHIVE_DOWNLOAD] 함수 호출됨! ID: {archive_id}\n")
            f.flush()
        
        # 로그인 체크를 수동으로 처리
        from flask import session
        if 'user_id' not in session:
            with open('/home/kca1000plus/bangsong/news-homepage/debug.log', 'a') as f:
                f.write(f"[ARCHIVE_DOWNLOAD] 로그인되지 않은 사용자\n")
                f.flush()
            return jsonify({"error": "로그인이 필요합니다."}), 401
        
        with open('/home/kca1000plus/bangsong/news-homepage/debug.log', 'a') as f:
            f.write(f"[DEBUG] 아카이브 다운로드 요청: ID {archive_id}\n")
            f.flush()
        
        archive = Archive.query.filter_by(id=archive_id).first()
        
        if not archive:
            with open('/home/kca1000plus/bangsong/news-homepage/debug.log', 'a') as f:
                f.write(f"[ERROR] 아카이브 ID {archive_id}를 찾을 수 없습니다.\n")
                f.flush()
            return jsonify({"error": "파일을 찾을 수 없습니다."}), 404
        
        with open('/home/kca1000plus/bangsong/news-homepage/debug.log', 'a') as f:
            f.write(f"[DEBUG] 아카이브 정보: {archive.original_filename}, 경로: {archive.file_path}\n")
            f.flush()
        
        if not os.path.exists(archive.file_path):
            with open('/home/kca1000plus/bangsong/news-homepage/debug.log', 'a') as f:
                f.write(f"[ERROR] 파일이 존재하지 않습니다: {archive.file_path}\n")
                f.flush()
            return jsonify({"error": "파일이 존재하지 않습니다."}), 404
        
        with open('/home/kca1000plus/bangsong/news-homepage/debug.log', 'a') as f:
            f.write(f"[DEBUG] 파일 다운로드 시작: {archive.original_filename}\n")
            f.flush()
        
        return send_file(
            archive.file_path,
            as_attachment=True,
            download_name=archive.original_filename
        )
    except Exception as e:
        with open('/home/kca1000plus/bangsong/news-homepage/debug.log', 'a') as f:
            import traceback
            f.write(f"[ERROR] 아카이브 다운로드 오류: {str(e)}\n")
            f.write(f"[ERROR] 아카이브 다운로드 오류 상세: {traceback.format_exc()}\n")
            f.flush()
        return jsonify({"error": str(e)}), 500


@main.route('/api/auto-save-analysis', methods=['POST'])
@login_required
def api_auto_save_analysis():
    """분석 완료 후 공개자료실 자동 저장 API"""
    try:
        data = request.get_json()
        company_name = data.get('company_name', '')
        analyzed_news = data.get('analyzed_news', [])
        comprehensive_opinion = data.get('comprehensive_opinion', '')
        start_date = data.get('start_date', '')
        end_date = data.get('end_date', '')
        
        print(f"[DEBUG] 자동 저장 API 호출: company_name={company_name}, analyzed_news_count={len(analyzed_news)}")
        print(f"[DEBUG] 검색기간: {start_date} ~ {end_date}")
        
        if not company_name or not analyzed_news or not comprehensive_opinion:
            return jsonify({"error": "필수 데이터가 누락되었습니다."}), 400
        
        # 공개자료실에 자동 저장
        try:
            current_user_id = session.get('user_id')
            current_user_email = session.get('user_email', '')
            auto_save_to_archive(company_name, analyzed_news, comprehensive_opinion, start_date, end_date, current_user_id, current_user_email)
        except Exception as e:
            print(f"공개자료실 자동 저장 중 오류: {str(e)}")
        
        return jsonify({"success": True, "message": "공개자료실에 자동 저장되었습니다."})
        
    except Exception as e:
        print(f"[DEBUG] 자동 저장 API 오류: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@main.route('/api/test/archive')
def api_test_archive():
    """공개자료실 테스트 API (로그인 불필요)"""
    try:
        print(f"[DEBUG] 공개자료실 테스트 API 호출됨")
        
        # 전체 아카이브 수 조회
        total_archives = Archive.query.count()
        print(f"[DEBUG] ORM으로 조회한 전체 아카이브 수: {total_archives}")
        
        # 모든 아카이브 조회
        archives = Archive.query.order_by(Archive.created_at.desc()).all()
        print(f"[DEBUG] ORM으로 조회된 아카이브 수: {len(archives)}")
        
        archive_list = []
        for i, archive in enumerate(archives):
            archive_info = {
                "id": archive.id,
                "original_filename": archive.original_filename,
                "company_name": archive.company_name,
                "analyzer_name": archive.analyzer_name,
                "created_at": archive.created_at.isoformat() if archive.created_at else None
            }
            archive_list.append(archive_info)
            print(f"[DEBUG] 아카이브 {i+1}: {archive_info}")
        
        return jsonify({
            "success": True,
            "total_count": total_archives,
            "archives": archive_list
        })
        
    except Exception as e:
        print(f"[DEBUG] 공개자료실 테스트 API 오류: {str(e)}")
        import traceback
        print(f"[DEBUG] 공개자료실 테스트 API 오류 상세: {traceback.format_exc()}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@main.route('/api/test/auto-save-simple')
def api_test_auto_save_simple():
    """간단한 자동 저장 테스트 API (로그인 불필요)"""
    try:
        print(f"[DEBUG] 간단한 자동 저장 테스트 API 호출됨")
        
        # 테스트 데이터 생성
        test_company_name = "테스트기업"
        test_analyzed_news = [
            {
                "news_info": {"title": "테스트 뉴스", "content": "테스트 내용"},
                "trend_analysis": {"sentiment": "positive", "score": 8},
                "award_analysis": {"has_awards": True, "award_count": 1},
                "investment_analysis": {"has_investments": False, "investment_count": 0}
            }
        ]
        test_comprehensive_opinion = "테스트 기업에 대한 종합 분석 결과입니다."
        
        print(f"[DEBUG] 테스트 데이터 준비 완료")
        print(f"[DEBUG] - company_name: {test_company_name}")
        print(f"[DEBUG] - analyzed_news 길이: {len(test_analyzed_news)}")
        print(f"[DEBUG] - comprehensive_opinion 길이: {len(test_comprehensive_opinion)}")
        
        # auto_save_to_archive 함수 호출
        result = auto_save_to_archive(
            test_company_name,
            test_analyzed_news,
            test_comprehensive_opinion,
            None,  # start_date
            None,  # end_date
            1,     # user_id
            "test@example.com"  # user_email
        )
        
        print(f"[DEBUG] auto_save_to_archive 결과: {result}")
        
        return jsonify({
            "success": result,
            "message": "자동 저장 테스트 완료"
        })
        
    except Exception as e:
        print(f"[DEBUG] 간단한 자동 저장 테스트 API 오류: {str(e)}")
        import traceback
        print(f"[DEBUG] 간단한 자동 저장 테스트 API 오류 상세: {traceback.format_exc()}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@main.route('/api/test/auto-save', methods=['POST'])
@login_required
def api_test_auto_save():
    """자동 저장 테스트 API"""
    try:
        data = request.get_json()
        company_name = data.get('company_name', '테스트기업')
        
        # 테스트 데이터 생성
        analyzed_news = [
            {
                'news_info': {
                    'title': '테스트 뉴스 제목',
                    'description': '테스트 뉴스 내용',
                    'source': '테스트 언론사',
                    'published': '2025-01-16',
                    'link': 'https://test.com'
                },
                'trend_analysis': {
                    'sentiment_score': 5.0,
                    'sentiment_label': '긍정적'
                },
                'award_analysis': {
                    'is_award_related': 'N',
                    'award_name': '',
                    'award_reason': ''
                },
                'investment_analysis': {
                    'is_investment_related': 'N',
                    'investment_name': '',
                    'investment_reason': ''
                }
            }
        ]
        
        comprehensive_opinion = "테스트 종합 의견입니다."
        
        # 자동 저장 실행 (테스트용이므로 검색기간은 None)
        try:
            current_user_id = session.get('user_id')
            current_user_email = session.get('user_email', '')
            auto_save_to_archive(company_name, analyzed_news, comprehensive_opinion, None, None, current_user_id, current_user_email)
        except Exception as e:
            print(f"테스트 자동 저장 중 오류: {str(e)}")
        
        return jsonify({"success": True, "message": "테스트 자동 저장 완료"})
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@main.route('/api/archive/<int:archive_id>/email', methods=['POST'])
@login_required
def api_archive_email(archive_id):
    """공개자료실 파일 이메일 발송"""
    try:
        archive = Archive.query.filter_by(id=archive_id).first()
        
        if not archive:
            return jsonify({"error": "파일을 찾을 수 없습니다."}), 404
        
        if not os.path.exists(archive.file_path):
            return jsonify({"error": "파일이 존재하지 않습니다."}), 404
        
        # 사용자 이메일 가져오기
        user_email = session.get('user_email')
        if not user_email:
            return jsonify({"error": "사용자 이메일 정보를 찾을 수 없습니다."}), 400
        
        # 이메일 발송
        email_service = EmailService()
        result = email_service.send_analysis_report(user_email, archive.company_name, archive.file_path)
        
        if result['success']:
            return jsonify({
                "success": True,
                "message": result['message']
            }), 200
        else:
            return jsonify({
                "success": False,
                "error": result['message']
            }), 500
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@main.route('/api/archive/<int:archive_id>', methods=['DELETE'])
@login_required
def api_archive_delete(archive_id):
    """공개자료실 파일 삭제"""
    try:
        user_id = session['user_id']
        user_email = session.get('user_email', '')
        
        # 현재 사용자 조회
        current_user = User.query.get(user_id)
        if not current_user:
            return jsonify({"error": "사용자를 찾을 수 없습니다."}), 404
        
        # 삭제할 파일 조회
        archive = Archive.query.filter_by(id=archive_id).first()
        
        if not archive:
            return jsonify({"error": "파일을 찾을 수 없습니다."}), 404
        
        # 권한 체크: 본인의 파일이거나 관리자인 경우만 삭제 가능
        is_owner = archive.user_id == user_id
        is_admin = current_user.is_admin()
        
        if not is_owner and not is_admin:
            return jsonify({"error": "이 파일을 삭제할 권한이 없습니다."}), 403
        
        # 파일 삭제
        if os.path.exists(archive.file_path):
            os.remove(archive.file_path)
        
        # 데이터베이스에서 삭제
        db.session.delete(archive)
        db.session.commit()
        
        # 삭제 로그
        if is_admin and not is_owner:
            print(f"[ADMIN] {user_email}(관리자)가 {archive.analyzer_name}의 파일 '{archive.original_filename}'을 삭제했습니다.")
        
        return jsonify({"message": "파일이 삭제되었습니다."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def _fetch_full_article_content(url):
    """기사 링크에서 전체 본문을 가져옵니다"""
    try:
        import requests
        from bs4 import BeautifulSoup
        import re
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        response.encoding = response.apparent_encoding
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # 불필요한 요소 제거
        for element in soup(['script', 'style', 'nav', 'header', 'footer', 'aside', 'noscript', 'iframe']):
            element.decompose()
        
        # 본문 추출 선택자
        content_selectors = [
            '#articleBody', '.article_body', '.article-content',
            '.news_end', '.article_body_wrp .end_body_wrp',
            'article', '.article-content', '.news-content', '.content',
            '.post-content', '.entry-content', '.story-content',
            '.article-body', '.news-body', '.story-body'
        ]
        
        content = ""
        for selector in content_selectors:
            elements = soup.select(selector)
            if elements:
                texts = []
                for elem in elements:
                    text = elem.get_text().strip()
                    if len(text) > 50:
                        texts.append(text)
                content = ' '.join(texts)
                if len(content) > 300:
                    break
        
        # 본문을 찾지 못한 경우 p 태그에서 추출
        if not content or len(content) < 300:
            paragraphs = soup.find_all('p')
            texts = []
            for p in paragraphs:
                text = p.get_text().strip()
                if len(text) > 30:
                    texts.append(text)
            content = ' '.join(texts)
        
        # 텍스트 정리
        if content:
            content = re.sub(r'\s+', ' ', content)
            content = content.strip()
            
            if len(content) > 30000:
                content = content[:30000]
        
        return content if len(content) > 100 else None
        
    except Exception as e:
        print(f"[DEBUG] 본문 가져오기 실패: {str(e)}")
        return None

def _fetch_full_content_for_news_list(news_items):
    """뉴스 목록에 대해 전체 본문 가져오기 (엑셀/AI 분석용)
    - 네이버 뉴스 링크: 전체 본문 가져오기
    - 원본 링크: 요약본 사용
    """
    import requests
    from bs4 import BeautifulSoup
    import re
    
    for i, news in enumerate(news_items):
        link = news.get('link', '')
        description = news.get('description', '')
        link_type = news.get('link_type', '')
        
        if not link:
            continue
        
        # 구글 뉴스 또는 네이버 뉴스만 전체 본문 가져오기
        is_naver = link_type == 'naver' or ('news.naver.com' in link or 'n.news.naver.com' in link)
        is_google = 'news.google.com' in link
        
        if not is_naver and not is_google:
            if i < 3:
                print(f"[FETCH] 뉴스 {i+1}/{len(news_items)} 원본 링크 - 요약본 사용: {link[:80]}...")
            continue
        
        try:
            # 구글 뉴스인 경우 description이 제목과 같으면 반드시 본문 가져오기
            if is_google and description == news.get('title', ''):
                print(f"[FETCH] 뉴스 {i+1}/{len(news_items)} 구글 뉴스 (description 없음) - 전체 본문 가져오기: {link[:80]}...")
            elif is_naver:
                print(f"[FETCH] 뉴스 {i+1}/{len(news_items)} 네이버 뉴스 - 전체 본문 가져오기: {link[:80]}...")
            
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
            
            response = requests.get(link, headers=headers, timeout=10)
            response.raise_for_status()
            
            # 인코딩 자동 감지 및 설정
            if response.encoding is None or response.encoding.lower() in ['iso-8859-1', 'windows-1252']:
                # 인코딩이 없거나 잘못된 경우 자동 감지
                response.encoding = response.apparent_encoding
            
            # UTF-8이 아닌 경우 UTF-8로 변환 시도
            if response.encoding and response.encoding.lower() not in ['utf-8', 'utf8']:
                try:
                    # 원본 바이트를 UTF-8로 디코딩 시도
                    content_bytes = response.content
                    text = content_bytes.decode('utf-8', errors='ignore')
                    response._content = text.encode('utf-8')
                    response.encoding = 'utf-8'
                except:
                    # 실패하면 apparent_encoding 사용
                    response.encoding = response.apparent_encoding
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # 불필요한 요소 제거
            for element in soup(['script', 'style', 'nav', 'header', 'footer', 'aside', 'noscript', 'iframe']):
                element.decompose()
            
            # 본문 추출 선택자
            content_selectors = [
                '#articleBody', '.article_body', '.article-content',
                '.news_end', '.article_body_wrp .end_body_wrp',
                'article', '.article-content', '.news-content', '.content',
                '.post-content', '.entry-content', '.story-content',
                '.article-body', '.news-body', '.story-body'
            ]
            
            content = ""
            for selector in content_selectors:
                elements = soup.select(selector)
                if elements:
                    texts = []
                    for elem in elements:
                        text = elem.get_text().strip()
                        if len(text) > 50:
                            texts.append(text)
                    content = ' '.join(texts)
                    if len(content) > 300:
                        break
            
            # 본문을 찾지 못한 경우 p 태그에서 추출
            if not content or len(content) < 300:
                paragraphs = soup.find_all('p')
                texts = []
                for p in paragraphs:
                    text = p.get_text().strip()
                    if len(text) > 30:
                        texts.append(text)
                content = ' '.join(texts)
            
            # 텍스트 정리
            if content:
                content = re.sub(r'\s+', ' ', content)
                content = content.strip()
                
                if len(content) > 30000:
                    content = content[:30000]
                
                if len(content) > len(description):
                    news['description'] = content
                    print(f"[FETCH] ✓ 전체 본문 사용: {len(content)}자 (원본: {len(description)}자)")
                else:
                    print(f"[FETCH] ✗ 본문이 짧아 요약본 사용: {len(content)}자")
            else:
                print(f"[FETCH] ✗ 본문 추출 실패, 요약본 사용")
                
        except Exception as e:
            print(f"[FETCH] ✗ 뉴스 {i+1} 본문 가져오기 실패 (요약본 사용): {str(e)}")
            continue
    
    return news_items

def create_news_excel_file(query, news_results):
    """뉴스 검색 결과를 엑셀 파일로 생성 (전체 본문은 이미 뉴스 검색 시 가져옴)"""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from io import BytesIO
    import re
    
    # 워크북 생성
    wb = Workbook()
    ws = wb.active
    ws.title = "뉴스 검색 결과"
    
    # 헤더 설정
    headers = ['분석소스', '뉴스제목', '뉴스내용', '출처', '링크']
    
    # 헤더 스타일
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    header_alignment = Alignment(horizontal='center', vertical='center')
    
    # 테두리 스타일
    thin_border = Border(
        left=Side(style='thin'), 
        right=Side(style='thin'), 
        top=Side(style='thin'), 
        bottom=Side(style='thin')
    )
    
    # 헤더 작성
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_alignment
        cell.border = thin_border
    
    # 데이터 입력
    for row, news in enumerate(news_results, 2):
        # 분석소스 결정
        search_source = news.get('search_source', '')
        if '네이버' in search_source:
            source_code = 'N'
        elif '구글' in search_source:
            source_code = 'G'
        else:
            source_code = 'U'  # Unknown
        
        # HTML 태그 제거 함수
        def clean_html(text):
            if not text:
                return ""
            # HTML 태그 제거
            clean = re.compile('<.*?>')
            text = re.sub(clean, '', str(text))
            # HTML 엔티티 디코딩
            text = text.replace('&nbsp;', ' ')
            text = text.replace('&amp;', '&')
            text = text.replace('&lt;', '<')
            text = text.replace('&gt;', '>')
            text = text.replace('&quot;', '"')
            text = text.replace('&#39;', "'")
            return text.strip()
        
        # 뉴스 내용 추출 (전체 본문은 이미 뉴스 검색 시 가져옴)
        description = news.get('description', '')
        
        # description이 비어있으면 title 사용
        if not description or description.strip() == '':
            description = news.get('title', '')
        
        # 데이터 입력
        ws.cell(row=row, column=1, value=source_code)
        ws.cell(row=row, column=2, value=clean_html(news.get('title', '')))
        ws.cell(row=row, column=3, value=clean_html(description))
        ws.cell(row=row, column=4, value=clean_html(news.get('source', '') or news.get('press_name', '')))
        ws.cell(row=row, column=5, value=news.get('link', ''))
        
        # 데이터 행에 테두리 추가
        for col in range(1, 6):
            ws.cell(row=row, column=col).border = thin_border
    
    # 열 너비 조정
    ws.column_dimensions['A'].width = 12  # 분석소스
    ws.column_dimensions['B'].width = 50  # 뉴스제목
    ws.column_dimensions['C'].width = 60  # 뉴스내용
    ws.column_dimensions['D'].width = 20  # 출처
    ws.column_dimensions['E'].width = 60  # 링크
    
    # 행 높이 조정 (헤더)
    ws.row_dimensions[1].height = 25
    
    # BytesIO 버퍼에 저장
    excel_buffer = BytesIO()
    wb.save(excel_buffer)
    excel_buffer.seek(0)
    
    return excel_buffer # 다수 기업 검색 API 추가 코드

@main.route('/api/multi-company-search', methods=['POST'])
@login_required
def api_multi_company_search():
    """다수 기업 일괄 검색 API (스트리밍)"""
    import zipfile
    from io import BytesIO
    
    try:
        data = request.get_json()
        companies = data.get('companies', [])
        start_date = data.get('start_date', '')
        end_date = data.get('end_date', '')
        
        if not companies:
            return jsonify({"error": "검색할 기업을 선택해주세요"}), 400
        
        if not start_date or not end_date:
            return jsonify({"error": "검색 기간을 설정해주세요"}), 400
        
        print(f"[DEBUG] 다수 기업 검색 시작: {len(companies)}개 기업, 기간: {start_date} ~ {end_date}")
        
        def generate():
            success_count = 0
            error_count = 0
            excel_files = []  # (filename, buffer) 튜플 리스트
            
            try:
                for idx, company in enumerate(companies, 1):
                    try:
                        print(f"[DEBUG] [{idx}/{len(companies)}] {company} 검색 시작")
                        
                        # 1단계: 검색 시작
                        progress_data = {
                            'type': 'progress',
                            'company': company,
                            'completed': idx - 1,
                            'total': len(companies),
                            'status': 'processing',
                            'message': '뉴스 검색 중...'
                        }
                        yield f"data: {json.dumps(progress_data, ensure_ascii=False)}\n\n"
                        
                        # 뉴스 검색
                        search_results = news_service.search_news_by_period(
                            query=company,
                            start_date=start_date,
                            end_date=end_date
                        )
                        
                        # 검색 결과 처리
                        if isinstance(search_results, dict):
                            news_items = search_results.get('news', [])
                            total_before = search_results.get('total_before_dedup', len(news_items))
                            duplicates = search_results.get('duplicates_removed', 0)
                            period_filtered = search_results.get('period_filtered', 0)
                            total_after = search_results.get('total_after_dedup', len(news_items))
                            naver_count = search_results.get('naver_count', 0)
                            google_count = search_results.get('google_count', 0)
                        else:
                            news_items = search_results
                            total_before = len(news_items)
                            duplicates = 0
                            period_filtered = 0
                            total_after = len(news_items)
                            naver_count = 0
                            google_count = 0
                        
                        print(f"[DEBUG] {company}: 총 {total_before}개 → 필터링 후 {total_after}개")
                        
                        if total_after == 0:
                            # 검색 결과 없음
                            progress_data = {
                                'type': 'progress',
                                'company': company,
                                'completed': idx,
                                'total': len(companies),
                                'status': 'success',
                                'message': '검색 결과 없음 (0개)'
                            }
                            yield f"data: {json.dumps(progress_data, ensure_ascii=False)}\n\n"
                            error_count += 1
                            continue
                        
                        # 2단계: 검색 완료 및 통계 정보
                        filter_msg = ""
                        if period_filtered > 0 or duplicates > 0:
                            filter_parts = []
                            if period_filtered > 0:
                                filter_parts.append(f"{period_filtered}개 (기간 필터링)")
                            if duplicates > 0:
                                filter_parts.append(f"{duplicates}개 (중복도율 필터링)")
                            filter_msg = f" - 필터링 제거: {' + '.join(filter_parts)}"
                        
                        source_msg = ""
                        if naver_count > 0 or google_count > 0:
                            source_msg = f" (네이버: {naver_count}개, 구글: {google_count}개)"
                        
                        progress_data = {
                            'type': 'progress',
                            'company': company,
                            'completed': idx - 1,
                            'total': len(companies),
                            'status': 'processing',
                            'message': f'총 {total_before}개 발견{filter_msg} → 최종 {total_after}개{source_msg}'
                        }
                        yield f"data: {json.dumps(progress_data, ensure_ascii=False)}\n\n"
                        
                        # 3단계: 뉴스 본문 크롤링
                        progress_data = {
                            'type': 'progress',
                            'company': company,
                            'completed': idx - 1,
                            'total': len(companies),
                            'status': 'processing',
                            'message': f'뉴스 본문 수집 중... ({total_after}개)'
                        }
                        yield f"data: {json.dumps(progress_data, ensure_ascii=False)}\n\n"
                        
                        # 전체 본문 가져오기 (개별 검색과 동일한 로직)
                        print(f"[DEBUG] {company}: 뉴스 본문 크롤링 시작...")
                        news_items = _fetch_full_content_for_news_list(news_items)
                        print(f"[DEBUG] {company}: 뉴스 본문 크롤링 완료")
                        
                        # 4단계: 엑셀 파일 생성
                        progress_data = {
                            'type': 'progress',
                            'company': company,
                            'completed': idx - 1,
                            'total': len(companies),
                            'status': 'processing',
                            'message': f'엑셀 파일 생성 중... ({total_after}개 뉴스)'
                        }
                        yield f"data: {json.dumps(progress_data, ensure_ascii=False)}\n\n"
                        
                        # 엑셀 파일 생성
                        excel_buffer = create_simple_excel(company, news_items, start_date, end_date)
                        
                        # 파일명 생성
                        filename = f"{company}_뉴스검색결과_{start_date.replace('-', '')}_{end_date.replace('-', '')}.xlsx"
                        excel_files.append((filename, excel_buffer))
                        
                        success_count += 1
                        
                        # 5단계: 완료
                        progress_data = {
                            'type': 'progress',
                            'company': company,
                            'completed': idx,
                            'total': len(companies),
                            'status': 'success',
                            'message': f'✓ 수집 완료 ({total_after}개 뉴스)'
                        }
                        yield f"data: {json.dumps(progress_data, ensure_ascii=False)}\n\n"
                        
                    except Exception as e:
                        print(f"[ERROR] {company} 검색 실패: {str(e)}")
                        error_count += 1
                        
                        # 오류 진행 상황 전송
                        progress_data = {
                            'type': 'progress',
                            'company': company,
                            'completed': idx,
                            'total': len(companies),
                            'status': 'error',
                            'message': f'오류: {str(e)}'
                        }
                        yield f"data: {json.dumps(progress_data, ensure_ascii=False)}\n\n"
                
                # 모든 검색 완료 - ZIP 파일 생성
                if excel_files:
                    print(f"[DEBUG] ZIP 파일 생성 시작: {len(excel_files)}개 파일")
                    
                    # ZIP 파일 생성
                    zip_buffer = BytesIO()
                    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                        for filename, excel_buffer in excel_files:
                            zip_file.writestr(filename, excel_buffer.getvalue())
                    
                    # ZIP 파일 저장
                    zip_filename = f"다수기업검색결과_{datetime.now().strftime('%Y%m%d_%H%M')}.zip"
                    zip_path = os.path.join(tempfile.gettempdir(), zip_filename)
                    
                    with open(zip_path, 'wb') as f:
                        f.write(zip_buffer.getvalue())
                    
                    print(f"[DEBUG] ZIP 파일 저장 완료: {zip_path}")
                    
                    # 완료 메시지 전송
                    complete_data = {
                        'type': 'complete',
                        'success_count': success_count,
                        'error_count': error_count,
                        'total': len(companies),
                        'zip_filename': zip_filename
                    }
                    yield f"data: {json.dumps(complete_data, ensure_ascii=False)}\n\n"
                else:
                    # 모든 검색 실패
                    error_data = {
                        'type': 'error',
                        'message': '모든 기업 검색에 실패했습니다.'
                    }
                    yield f"data: {json.dumps(error_data, ensure_ascii=False)}\n\n"
                    
            except Exception as e:
                print(f"[ERROR] 다수 기업 검색 오류: {str(e)}")
                import traceback
                print(f"[ERROR] 오류 상세: {traceback.format_exc()}")
                
                error_data = {
                    'type': 'error',
                    'message': f'검색 중 오류가 발생했습니다: {str(e)}'
                }
                yield f"data: {json.dumps(error_data, ensure_ascii=False)}\n\n"
        
        response = Response(generate(), mimetype='text/event-stream')
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        response.headers['X-Accel-Buffering'] = 'no'
        response.headers['Connection'] = 'keep-alive'
        return response
        
    except Exception as e:
        print(f"[ERROR] 다수 기업 검색 API 오류: {str(e)}")
        return jsonify({"error": f"검색 요청 처리 중 오류가 발생했습니다: {str(e)}"}), 500


@main.route('/api/download-multi-result/<filename>')
@login_required
def api_download_multi_result(filename):
    """다수 기업 검색 결과 ZIP 파일 다운로드"""
    try:
        zip_path = os.path.join(tempfile.gettempdir(), filename)
        
        if not os.path.exists(zip_path):
            return jsonify({"error": "파일을 찾을 수 없습니다."}), 404
        
        # 파일 전송 후 삭제
        response = send_file(
            zip_path,
            as_attachment=True,
            download_name=filename,
            mimetype='application/zip'
        )
        
        # 파일 전송 후 삭제 (백그라운드)
        def delete_file():
            import time
            time.sleep(5)  # 5초 대기 후 삭제
            try:
                if os.path.exists(zip_path):
                    os.remove(zip_path)
                    print(f"[DEBUG] 임시 ZIP 파일 삭제: {zip_path}")
            except Exception as e:
                print(f"[ERROR] 임시 ZIP 파일 삭제 실패: {str(e)}")
        
        thread = threading.Thread(target=delete_file)
        thread.daemon = True
        thread.start()
        
        return response
        
    except Exception as e:
        print(f"[ERROR] ZIP 파일 다운로드 오류: {str(e)}")
        return jsonify({"error": str(e)}), 500


def create_simple_excel(company_name, news_items, start_date, end_date):
    """뉴스 검색 결과 엑셀 파일 생성 (개별 검색과 동일한 포맷)"""
    from openpyxl import Workbook
    from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
    from io import BytesIO
    import re
    
    wb = Workbook()
    ws = wb.active
    ws.title = "뉴스 검색 결과"
    
    # 헤더 설정 (개별 검색과 동일)
    headers = ['분석소스', '뉴스제목', '뉴스내용', '출처', '링크']
    
    # 헤더 스타일
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    header_alignment = Alignment(horizontal='center', vertical='center')
    
    # 테두리 스타일
    thin_border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )
    
    # 헤더 작성
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_alignment
        cell.border = thin_border
    
    # HTML 태그 제거 함수
    def clean_html(text):
        if not text:
            return ""
        # HTML 태그 제거
        clean = re.compile('<.*?>')
        text = re.sub(clean, '', str(text))
        # HTML 엔티티 디코딩
        text = text.replace('&nbsp;', ' ')
        text = text.replace('&amp;', '&')
        text = text.replace('&lt;', '<')
        text = text.replace('&gt;', '>')
        text = text.replace('&quot;', '"')
        text = text.replace('&#39;', "'")
        return text.strip()
    
    # 데이터 입력
    for row_idx, news in enumerate(news_items, 2):
        try:
            # news가 딕셔너리인지 확인
            if not isinstance(news, dict):
                print(f"[WARNING] 뉴스 아이템이 딕셔너리가 아닙니다: {type(news)}")
                continue
            
            # 분석소스 결정
            search_source = news.get('search_source', '')
            if '네이버' in search_source:
                source_code = 'N'
            elif '구글' in search_source:
                source_code = 'G'
            else:
                source_code = 'U'  # Unknown
            
            # 뉴스 내용 추출
            description = news.get('description', '')
            
            # description이 비어있으면 title 사용
            if not description or description.strip() == '':
                description = news.get('title', '')
            
            # 데이터 입력
            ws.cell(row=row_idx, column=1, value=source_code)
            ws.cell(row=row_idx, column=2, value=clean_html(news.get('title', '')))
            ws.cell(row=row_idx, column=3, value=clean_html(description))
            ws.cell(row=row_idx, column=4, value=clean_html(news.get('source', '') or news.get('press_name', '')))
            ws.cell(row=row_idx, column=5, value=news.get('link', ''))
            
            # 데이터 행에 테두리 추가
            for col in range(1, 6):
                ws.cell(row=row_idx, column=col).border = thin_border
                
        except Exception as e:
            print(f"[ERROR] 뉴스 데이터 처리 중 오류: {str(e)}, news type: {type(news)}")
            continue
    
    # 열 너비 조정
    ws.column_dimensions['A'].width = 12  # 분석소스
    ws.column_dimensions['B'].width = 50  # 뉴스제목
    ws.column_dimensions['C'].width = 60  # 뉴스내용
    ws.column_dimensions['D'].width = 20  # 출처
    ws.column_dimensions['E'].width = 60  # 링크
    
    # BytesIO 버퍼에 저장
    excel_buffer = BytesIO()
    wb.save(excel_buffer)
    excel_buffer.seek(0)
    
    return excel_buffer



# ==================== 기업 관리 API ====================

@main.route("/api/companies", methods=["GET"])
@login_required
def api_companies_list():
    """기업 목록 조회 (연도별)"""
    try:
        year = request.args.get('year', type=int)
        
        if year:
            # 특정 연도의 기업만 조회
            companies = Company.query.filter_by(year=year, is_active=True).order_by(Company.display_order, Company.name).all()
        else:
            # 모든 활성 기업 조회
            companies = Company.query.filter_by(is_active=True).order_by(Company.year.desc(), Company.display_order, Company.name).all()
        
        # 연도별로 그룹화
        companies_by_year = {}
        for company in companies:
            if company.year not in companies_by_year:
                companies_by_year[company.year] = []
            companies_by_year[company.year].append(company.to_dict())
        
        return jsonify({
            "success": True,
            "companies_by_year": companies_by_year,
            "total_count": len(companies)
        }), 200
        
    except Exception as e:
        print(f"[ERROR] 기업 목록 조회 실패: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": f"기업 목록 조회 실패: {str(e)}"}), 500


@main.route("/api/companies", methods=["POST"])
@login_required
def api_companies_create():
    """기업 추가"""
    try:
        data = request.get_json()
        name = data.get('name', '').strip()
        year = data.get('year')
        display_order = data.get('display_order', 0)
        
        # 유효성 검사
        if not name:
            return jsonify({"error": "기업명을 입력해주세요."}), 400
        
        if not year or not isinstance(year, int):
            return jsonify({"error": "올바른 연도를 입력해주세요."}), 400
        
        if year < 2020 or year > 2100:
            return jsonify({"error": "연도는 2020년부터 2100년 사이여야 합니다."}), 400
        
        # 중복 체크
        existing = Company.query.filter_by(name=name, year=year).first()
        if existing:
            if existing.is_active:
                return jsonify({"error": f"{year}년에 이미 '{name}' 기업이 존재합니다."}), 400
            else:
                # 비활성 기업을 다시 활성화
                existing.is_active = True
                existing.display_order = display_order
                existing.updated_at = datetime.utcnow()
                db.session.commit()
                
                print(f"[INFO] 기업 재활성화: {name} ({year})")
                return jsonify({
                    "success": True,
                    "message": "기업이 재활성화되었습니다.",
                    "company": existing.to_dict()
                }), 200
        
        # 새 기업 추가
        new_company = Company(
            name=name,
            year=year,
            display_order=display_order,
            is_active=True
        )
        
        db.session.add(new_company)
        db.session.commit()
        
        print(f"[INFO] 기업 추가: {name} ({year})")
        return jsonify({
            "success": True,
            "message": "기업이 추가되었습니다.",
            "company": new_company.to_dict()
        }), 201
        
    except Exception as e:
        db.session.rollback()
        print(f"[ERROR] 기업 추가 실패: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": f"기업 추가 실패: {str(e)}"}), 500


@main.route("/api/companies/<int:company_id>", methods=["PUT"])
@login_required
def api_companies_update(company_id):
    """기업 수정"""
    try:
        company = Company.query.get(company_id)
        if not company:
            return jsonify({"error": "기업을 찾을 수 없습니다."}), 404
        
        data = request.get_json()
        name = data.get('name', '').strip()
        year = data.get('year')
        display_order = data.get('display_order')
        
        # 유효성 검사
        if name and name != company.name:
            # 이름 변경 시 중복 체크
            existing = Company.query.filter_by(name=name, year=company.year).first()
            if existing and existing.id != company_id:
                return jsonify({"error": f"{company.year}년에 이미 '{name}' 기업이 존재합니다."}), 400
            company.name = name
        
        if year and year != company.year:
            if year < 2020 or year > 2100:
                return jsonify({"error": "연도는 2020년부터 2100년 사이여야 합니다."}), 400
            
            # 연도 변경 시 중복 체크
            existing = Company.query.filter_by(name=company.name, year=year).first()
            if existing and existing.id != company_id:
                return jsonify({"error": f"{year}년에 이미 '{company.name}' 기업이 존재합니다."}), 400
            company.year = year
        
        if display_order is not None:
            company.display_order = display_order
        
        company.updated_at = datetime.utcnow()
        db.session.commit()
        
        print(f"[INFO] 기업 수정: {company.name} ({company.year})")
        return jsonify({
            "success": True,
            "message": "기업이 수정되었습니다.",
            "company": company.to_dict()
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"[ERROR] 기업 수정 실패: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": f"기업 수정 실패: {str(e)}"}), 500


@main.route("/api/companies/<int:company_id>", methods=["DELETE"])
@login_required
def api_companies_delete(company_id):
    """기업 삭제 (소프트 삭제)"""
    try:
        company = Company.query.get(company_id)
        if not company:
            return jsonify({"error": "기업을 찾을 수 없습니다."}), 404
        
        # 소프트 삭제 (is_active를 False로 설정)
        company.is_active = False
        company.updated_at = datetime.utcnow()
        db.session.commit()
        
        print(f"[INFO] 기업 삭제: {company.name} ({company.year})")
        return jsonify({
            "success": True,
            "message": "기업이 삭제되었습니다."
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"[ERROR] 기업 삭제 실패: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": f"기업 삭제 실패: {str(e)}"}), 500


@main.route("/api/companies/years", methods=["GET"])
@login_required
def api_companies_years():
    """등록된 연도 목록 조회"""
    try:
        years = db.session.query(Company.year).filter_by(is_active=True).distinct().order_by(Company.year.desc()).all()
        year_list = [year[0] for year in years]
        
        return jsonify({
            "success": True,
            "years": year_list
        }), 200
        
    except Exception as e:
        print(f"[ERROR] 연도 목록 조회 실패: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": f"연도 목록 조회 실패: {str(e)}"}), 500
