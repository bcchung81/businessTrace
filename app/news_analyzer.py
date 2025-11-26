import openai
import os
from datetime import datetime
import json

class NewsAnalyzer:
    def __init__(self, model_name="gpt-4o-mini", temperature=0.3):
        # OpenAI API 설정 - 환경 변수에서 읽기
        self.api_key = os.environ.get("OPENAI_API_KEY", "")
        self.model_name = model_name
        self.temperature = temperature
        self._original_url_for_web_search = None  # 구글 뉴스 원문 URL 저장용
        print(f"[DEBUG] NewsAnalyzer 초기화 - 사용 모델: {self.model_name}, Temperature: {self.temperature}")
        print(f"[DEBUG] OpenAI 라이브러리 버전: {openai.__version__}")
        print(f"[DEBUG] API 키 존재 여부: {bool(self.api_key)}")
        print(f"[DEBUG] API 키 길이: {len(self.api_key) if self.api_key else 0}")
        
        try:
            print(f"[DEBUG] OpenAI 클라이언트 초기화 시도...")
            self.client = openai.OpenAI(api_key=self.api_key)
            print(f"[DEBUG] OpenAI 클라이언트 초기화 성공!")
        except Exception as e:
            import traceback
            print(f"[ERROR] ===== OpenAI 클라이언트 초기화 실패 =====")
            print(f"[ERROR] 오류 타입: {type(e).__name__}")
            print(f"[ERROR] 오류 메시지: {str(e)}")
            print(f"[ERROR] 오류 상세:")
            print(traceback.format_exc())
            print(f"[ERROR] ===== OpenAI 클라이언트 초기화 실패 끝 =====")
            self.client = None
        
    def analyze_awards(self, company_name, news_items):
        """수상실적 분석"""
        print(f"[DEBUG] analyze_awards 시작 - 회사: {company_name}, 뉴스 개수: {len(news_items)}")
        
        if not news_items:
            print("[DEBUG] 뉴스 아이템이 없음")
            return {
                "success": False,
                "message": "분석할 뉴스가 없습니다."
            }
        
        try:
            awards = []
            
            # 각 뉴스별로 개별 분석
            for i, news in enumerate(news_items):  # 모든 뉴스 분석
                print(f"[DEBUG] 뉴스 {i+1} 분석 중...")
                title = news.get('title', '')
                description = news.get('description', '')
                source = news.get('source', '')
                published = news.get('published', '')
                link = news.get('link', '')
                
                print(f"[DEBUG] 뉴스 제목: {title[:50]}...")
                
                # 개별 뉴스 분석
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
                    response = self.client.chat.completions.create(
                        model=self.model_name,
                        messages=[
                            {"role": "system", "content": "당신은 뉴스 분석 전문가입니다. 정확하고 객관적으로 뉴스를 분석해주세요."},
                            {"role": "user", "content": prompt}
                        ],
                        max_tokens=1000,
                        temperature=self.temperature
                    )
                    
                    # 강화된 JSON 파싱 함수 사용
                    result = self._extract_and_parse_json(response.choices[0].message.content, i+1)
                    if result and isinstance(result, dict):
                        print(f"[DEBUG] 뉴스 {i+1} 분석 결과: {result}")
                    else:
                        print(f"[DEBUG] 뉴스 {i+1} JSON 파싱 실패, 다음 뉴스로 진행")
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
                        print(f"[DEBUG] 수상실적 발견: {award_info.get('award_name', '')}")
                    
                except Exception as e:
                    print(f"[DEBUG] 뉴스 {i+1} 분석 중 오류: {str(e)}")
                    continue
            
            # 최신순으로 정렬
            awards.sort(key=lambda x: x.get("year", ""), reverse=True)
            
            print(f"[DEBUG] 최종 수상실적 개수: {len(awards)}")
            
            return {
                "success": True,
                "company_name": company_name,
                "awards": awards,
                "total_awards": len(awards),
                "analysis_summary": f"총 {len(awards)}개의 수상실적을 발견했습니다." if awards else "수상 관련 뉴스를 찾을 수 없습니다.",
                "analysis_type": "awards",
                "analysis_date": datetime.now().isoformat()
            }
            
        except Exception as e:
            print(f"[DEBUG] analyze_awards 전체 오류: {str(e)}")
            return {
                "success": False,
                "message": f"분석 중 오류가 발생했습니다: {str(e)}",
                "analysis_type": "awards"
            }
    
    def analyze_investment(self, company_name, news_items):
        """투자실적 분석"""
        print(f"[DEBUG] analyze_investment 시작 - 회사: {company_name}, 뉴스 개수: {len(news_items)}")
        
        if not news_items:
            print("[DEBUG] 뉴스 아이템이 없음")
            return {
                "success": False,
                "message": "분석할 뉴스가 없습니다."
            }
        
        try:
            investment_raised = []
            investment_made = []
            
            # 각 뉴스별로 개별 분석
            for i, news in enumerate(news_items):  # 모든 뉴스 분석
                print(f"[DEBUG] 투자 뉴스 {i+1} 분석 중...")
                title = news.get('title', '')
                description = news.get('description', '')
                source = news.get('source', '')
                published = news.get('published', '')
                link = news.get('link', '')
                
                print(f"[DEBUG] 투자 뉴스 제목: {title[:50]}...")
                
                # 개별 뉴스 분석
                news_text = f"""
뉴스 제목: {title}
뉴스 내용: {description}
출처: {source}
날짜: {published}
"""
                
                prompt = f"""
다음은 '{company_name}' 회사에 대한 뉴스입니다. 이 뉴스에서 투자 관련 정보를 찾아주세요.

분석 요구사항:
1. 투자 관련 뉴스인지 판단 (투자유치, 투자, 펀딩, funding, 시리즈A/B/C, IPO 등)
2. 투자 유형 분류:
   - 투자유치: 외부에서 받은 투자
   - 투자성과: 다른 회사에 투자한 경우
3. 투자 관련이면 다음 정보 추출:
   - 투자 연도
   - 투자 라운드/유형
   - 투자 금액
   - 투자처/투자받은 곳
   - 투자 목적

뉴스 내용:
{news_text}

반드시!!! 다음 JSON 형식으로 응답해주세요. 다른형식으로 응답하면 처리를 할수 없습니다.:
{{
    "is_investment_related": true/false,
    "investment_type": "raised" or "made" or null,
    "investment_info": {{
        "year": "2023",
        "round": "시리즈A",
        "amount": "100억원",
        "investors": ["투자처1", "투자처2"],
        "purpose": "투자 목적"
    }}
}}

투자 관련이 아니면 "is_investment_related": false로 응답해주세요.
"""
                
                try:
                    response = self.client.chat.completions.create(
                        model=self.model_name,
                        messages=[
                            {"role": "system", "content": "당신은 투자 분석 전문가입니다. 정확하고 객관적으로 투자 정보를 분석해주세요."},
                            {"role": "user", "content": prompt}
                        ],
                        max_tokens=1000,
                        temperature=self.temperature
                    )
                    
                    # 강화된 JSON 파싱 함수 사용
                    result = self._extract_and_parse_json(response.choices[0].message.content, i+1)
                    if result and isinstance(result, dict):
                        print(f"[DEBUG] 투자 뉴스 {i+1} 분석 결과: {result}")
                    else:
                        print(f"[DEBUG] 투자 뉴스 {i+1} JSON 파싱 실패, 다음 뉴스로 진행")
                        continue
                    
                    if result.get("is_investment_related", False) and result.get("investment_info"):
                        investment_info = result["investment_info"]
                        investment_data = {
                            "year": investment_info.get("year", ""),
                            "round": investment_info.get("round", ""),
                            "amount": investment_info.get("amount", ""),
                            "purpose": investment_info.get("purpose", ""),
                            "news_title": title,
                            "news_link": link,
                            "news_source": source,
                            "news_date": published
                        }
                        
                        if result.get("investment_type") == "raised":
                            investment_data["investors"] = investment_info.get("investors", [])
                            investment_raised.append(investment_data)
                            print(f"[DEBUG] 투자유치 발견: {investment_info.get('amount', '')}")
                        elif result.get("investment_type") == "made":
                            investment_data["target_company"] = investment_info.get("investors", [""])[0] if investment_info.get("investors") else ""
                            investment_made.append(investment_data)
                            print(f"[DEBUG] 투자성과 발견: {investment_info.get('amount', '')}")
                    
                except Exception as e:
                    print(f"[DEBUG] 투자 뉴스 {i+1} 분석 중 오류: {str(e)}")
                    continue
            
            # 최신순으로 정렬
            investment_raised.sort(key=lambda x: x.get("year", ""), reverse=True)
            investment_made.sort(key=lambda x: x.get("year", ""), reverse=True)
            
            print(f"[DEBUG] 최종 투자유치 개수: {len(investment_raised)}, 투자성과 개수: {len(investment_made)}")
            
            return {
                "success": True,
                "company_name": company_name,
                "investment_raised": investment_raised,
                "investment_made": investment_made,
                "total_investments": len(investment_raised) + len(investment_made),
                "analysis_summary": f"투자유치 {len(investment_raised)}건, 투자성과 {len(investment_made)}건을 발견했습니다." if (investment_raised or investment_made) else "투자 관련 뉴스를 찾을 수 없습니다.",
                "analysis_type": "investment",
                "analysis_date": datetime.now().isoformat()
            }
            
        except Exception as e:
            print(f"[DEBUG] analyze_investment 전체 오류: {str(e)}")
            return {
                "success": False,
                "message": f"분석 중 오류가 발생했습니다: {str(e)}",
                "analysis_type": "investment"
            }
    
    def analyze_trends(self, company_name, news_items):
        """동향분석"""
        if not news_items:
            return {
                "success": False,
                "message": "분석할 뉴스가 없습니다."
            }
        
        try:
            recent_trends = []
            growth_trends = []
            future_outlook = None
            
            # 각 뉴스별로 개별 분석
            for news in news_items:  # 모든 뉴스 분석
                title = news.get('title', '')
                description = news.get('description', '')
                source = news.get('source', '')
                published = news.get('published', '')
                link = news.get('link', '')
                
                # 개별 뉴스 분석
                news_text = f"""
뉴스 제목: {title}
뉴스 내용: {description}
출처: {source}
날짜: {published}
"""
                
                prompt = f"""
다음은 '{company_name}' 회사에 대한 뉴스입니다. 이 뉴스에서 회사 동향 관련 정보를 분석해주세요.

분석 요구사항:
1. 최근 트렌드 (긍정/부정/중립 영향도 포함)
2. 성장 동향
3. 향후 전망

뉴스 내용:
{news_text}

반드시!!! 다음 JSON 형식으로 응답해주세요. 다른형식으로 응답하면 처리를 할수 없습니다.:
{{
    "trends": [
        {{
            "trend": "주요 트렌드",
            "description": "트렌드 설명",
            "impact": "영향도 (긍정/부정/중립)"
        }}
    ],
    "growth_info": [
        {{
            "area": "성장 영역",
            "description": "성장 내용",
            "year": "연도"
        }}
    ],
    "outlook_info": {{
        "opportunities": ["기회요인1", "기회요인2"],
        "risks": ["위험요인1", "위험요인2"],
        "strategic_direction": "전략적 방향성"
    }}
}}
"""
                
                response = self.client.chat.completions.create(
                    model=self.model_name,
                    messages=[
                        {"role": "system", "content": "당신은 기업 동향 분석 전문가입니다. 객관적이고 종합적으로 기업의 동향을 분석해주세요."},
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=1500,
                    temperature=self.temperature
                )
                
                # 강화된 JSON 파싱 함수 사용
                result = self._extract_and_parse_json(response.choices[0].message.content, 0)
                if not result or not isinstance(result, dict):
                    print(f"[DEBUG] 동향분석 JSON 파싱 실패, 다음 뉴스로 진행")
                    continue
                
                # 트렌드 정보 수집
                if result.get("trends"):
                    for trend in result["trends"]:
                        trend["news_title"] = title
                        trend["news_link"] = link
                        trend["news_source"] = source
                        trend["news_date"] = published
                        recent_trends.append(trend)
                
                # 성장 동향 정보 수집
                if result.get("growth_info"):
                    for growth in result["growth_info"]:
                        growth["news_title"] = title
                        growth["news_link"] = link
                        growth["news_source"] = source
                        growth["news_date"] = published
                        growth_trends.append(growth)
                
                # 향후 전망 정보 수집
                if result.get("outlook_info") and not future_outlook:
                    future_outlook = result["outlook_info"]
            
            return {
                "success": True,
                "company_name": company_name,
                "recent_trends": recent_trends,
                "growth_trends": growth_trends,
                "future_outlook": future_outlook,
                "analysis_summary": f"총 {len(recent_trends)}개의 트렌드를 분석했습니다." if recent_trends else "동향 관련 뉴스를 찾을 수 없습니다.",
                "analysis_type": "trends",
                "analysis_date": datetime.now().isoformat()
            }
            
        except Exception as e:
            return {
                "success": False,
                "message": f"분석 중 오류가 발생했습니다: {str(e)}",
                "analysis_type": "trends"
            }
    
    def analyze_awards_streaming(self, company_name, news_items):
        """수상실적 분석 (스트리밍)"""
        print(f"[DEBUG] analyze_awards_streaming 시작 - 회사: {company_name}, 뉴스 개수: {len(news_items)}")
        
        if not news_items:
            print("[DEBUG] 뉴스 아이템이 없음")
            return {
                "success": False,
                "message": "분석할 뉴스가 없습니다."
            }
        
        try:
            awards = []
            
            # 각 뉴스별로 개별 분석
            for i, news in enumerate(news_items[:20]):  # 최대 20개 뉴스만 분석
                print(f"[DEBUG] 뉴스 {i+1} 분석 중...")
                title = news.get('title', '')
                description = news.get('description', '')
                source = news.get('source', '')
                published = news.get('published', '')
                link = news.get('link', '')
                
                print(f"[DEBUG] 뉴스 제목: {title[:50]}...")
                
                # 개별 뉴스 분석
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
                    # 스트리밍 응답 받기
                    response = self.client.chat.completions.create(
                        model=self.model_name,
                        messages=[
                            {"role": "system", "content": "당신은 뉴스 분석 전문가입니다. 정확하고 객관적으로 뉴스를 분석해주세요."},
                            {"role": "user", "content": prompt}
                        ],
                        max_tokens=1000,
                        temperature=self.temperature,
                        stream=True  # 스트리밍 활성화
                    )
                    
                    # 스트리밍 응답 처리
                    full_response = ""
                    for chunk in response:
                        if chunk.choices[0].delta.content:
                            content = chunk.choices[0].delta.content
                            full_response += content
                            # 여기서 실시간으로 프론트엔드에 전송할 수 있음
                            print(f"[STREAM] {content}", end="", flush=True)
                    
                    print(f"\n[DEBUG] 완전한 응답: {full_response}")
                    
                    # 강화된 JSON 파싱 함수 사용
                    result = self._extract_and_parse_json(full_response, i+1)
                    if result and isinstance(result, dict):
                        print(f"[DEBUG] 뉴스 {i+1} 분석 결과: {result}")
                    else:
                        print(f"[DEBUG] 뉴스 {i+1} JSON 파싱 실패, 다음 뉴스로 진행")
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
                        print(f"[DEBUG] 수상실적 발견: {award_info.get('award_name', '')}")
                    
                except Exception as e:
                    print(f"[DEBUG] 뉴스 {i+1} 분석 중 오류: {str(e)}")
                    continue
            
            # 최신순으로 정렬
            awards.sort(key=lambda x: x.get("year", ""), reverse=True)
            
            print(f"[DEBUG] 최종 수상실적 개수: {len(awards)}")
            
            return {
                "success": True,
                "company_name": company_name,
                "awards": awards,
                "total_awards": len(awards),
                "analysis_summary": f"총 {len(awards)}개의 수상실적을 발견했습니다." if awards else "수상 관련 뉴스를 찾을 수 없습니다.",
                "analysis_type": "awards",
                "analysis_date": datetime.now().isoformat()
            }
            
        except Exception as e:
            print(f"[DEBUG] analyze_awards_streaming 전체 오류: {str(e)}")
            return {
                "success": False,
                "message": f"분석 중 오류가 발생했습니다: {str(e)}",
                "analysis_type": "awards"
            }
    
    def analyze_news_comprehensive(self, company_name, news_items):
        """뉴스별 종합 분석 (동향분석, 수상실적분석, 투자실적분석)"""
        print(f"[DEBUG] analyze_news_comprehensive 시작 - 회사: {company_name}, 뉴스 개수: {len(news_items)}")
        
        if not news_items:
            print("[DEBUG] 뉴스 아이템이 없음")
            return {
                "success": False,
                "message": "분석할 뉴스가 없습니다."
            }
        
        try:
            analyzed_news = []
            
            # 뉴스 기간 계산
            dates = [news.get('published', '') for news in news_items if news.get('published')]
            if dates:
                start_date = min(dates)
                end_date = max(dates)
            else:
                start_date = "날짜 정보 없음"
                end_date = "날짜 정보 없음"
            
            # 초기 진행 정보
            progress_info = {
                "company_name": company_name,
                "total_news": len(news_items),
                "start_date": start_date,
                "end_date": end_date,
                "current_news": 0,
                "current_step": "",
                "message": f"{company_name} 기업관련 {start_date} ~ {end_date} 까지 {len(news_items)}건의 뉴스를 발견했습니다."
            }
            
            # 각 뉴스별로 개별 분석
            for i, news in enumerate(news_items):  # 모든 뉴스 분석
                current_news_num = i + 1
                print(f"[DEBUG] 뉴스 {current_news_num} 종합 분석 중...")
                
                # 진행 정보 업데이트
                progress_info["current_news"] = current_news_num
                progress_info["message"] = f"{company_name}에 대한 {current_news_num}번째 뉴스를 분석하고 있습니다."
                
                title = news.get('title', '')
                description = news.get('description', '')
                source = news.get('source', '')
                published = news.get('published', '')
                link = news.get('link', '')
                
                print(f"[DEBUG] 뉴스 제목: {title[:50]}...")
                print(f"[DEBUG] 원본 description 길이: {len(description)}자")
                
                # 네이버 뉴스 또는 구글 뉴스인 경우 전체 본문 가져오기
                is_naver = link and ('news.naver.com' in link or 'n.news.naver.com' in link)
                is_google = link and 'news.google.com' in link
                
                if is_naver or (is_google and description == title):
                    if is_naver:
                        print(f"[DEBUG] 뉴스 {current_news_num} 네이버 뉴스 - 전체 본문 가져오기 시도...")
                    else:
                        print(f"[DEBUG] 뉴스 {current_news_num} 구글 뉴스 (description 없음) - 전체 본문 가져오기 시도...")
                    
                    full_content = self._fetch_article_content(link)
                    if full_content and len(full_content) > len(description):
                        print(f"[DEBUG] ✓ 전체 본문 사용: {len(full_content)}자")
                        description = full_content
                    else:
                        print(f"[DEBUG] ✗ 전체 본문 가져오기 실패, 요약본 사용: {len(description)}자")
                else:
                    print(f"[DEBUG] 원본 링크 - 요약본 사용: {len(description)}자")
                
                # 개별 뉴스 분석
                news_text = f"""
뉴스 제목: {title}
뉴스 내용: {description}
출처: {source}
날짜: {published}
"""
                
                prompt = f"""
다음은 '{company_name}' 회사에 대한 뉴스입니다. 이 뉴스를 종합적으로 분석해주세요.

분석 요구사항:

1. 동향분석: 뉴스의 내용을 요약하고 긍정/부정 점수 매기기
2. 수상실적분석: 수상실적 여부인지 확인, 수상실적인지 이유를 작성
3. 투자실적분석: 투자실적 여부인지 확인, 투자실적인지 이유를 작성

뉴스 내용:
{news_text}

반드시!!! 다음 JSON 형식으로 응답해주세요. 다른형식으로 응답하면 처리를 할수 없습니다.:
{{
    "trend_analysis": {{
        "news_trend_summary": "뉴스의 내용을 요약한 내용",
        "sentiment_score": -10 ~ 10 사이의 정수 (-10: 매우 부정적, 0: 중립, 10: 매우 긍정적),
        "sentiment_label": "매우 긍정적" or "긍정적" or "중립" or "부정적" or "매우 부정적"
    }},
    "award_analysis": {{
        "is_award_related": "Y" or "N",
        "award_reason": "수상실적 여부에 대한 이유 설명"
    }},
    "investment_analysis": {{
        "is_investment_related": "Y" or "N", 
        "investment_reason": "투자실적 여부에 대한 이유 설명"
    }}
}}

각 분석은 객관적이고 정확하게 해주세요.
긍정/부정 점수는 뉴스 내용의 전반적인 톤과 회사에 미치는 영향을 고려하여 판단해주세요.
점수 기준:
- 8~10: 매우 긍정적 (혁신적 성과, 시장 지배력 확대, 매출/이익 대폭 증가 등)
- 4~7: 긍정적 (성장, 수상, 투자 유치, 긍정적 전망 등)
- 1~3: 약간 긍정적 (소폭 개선, 안정적 운영 등)
- 0: 중립 (정보 제공, 사실 전달 등)
- -1~-3: 약간 부정적 (소폭 하락, 경쟁 압박 등)
- -4~-7: 부정적 (실적 악화, 규제 압박, 경쟁 우위 상실 등)
- -8~-10: 매우 부정적 (심각한 위기, 매출 급감, 경영 위기 등)
"""
                
                try:
                    # 동향 분석 진행 정보
                    progress_info["current_step"] = "trend"
                    progress_info["message"] = f"{company_name}에 대한 {current_news_num}번째 뉴스의 동향 분석을 하고 있습니다."
                    
                    # ChatGPT API 호출 (재시도 로직 포함)
                    result = self._call_chatgpt_with_retry(prompt, current_news_num)
                    
                    if result is None:
                        # API 호출 실패 시 기본값 사용
                        raise Exception("ChatGPT API 호출 실패")
                    
                    print(f"[DEBUG] 뉴스 {current_news_num} 종합 분석 결과: {result}")
                    
                    # 수상실적 분석 진행 정보
                    progress_info["current_step"] = "award"
                    progress_info["message"] = f"{company_name}에 대한 {current_news_num}번째 뉴스의 수상실적 분석을 하고 있습니다."
                    
                    # 투자실적 분석 진행 정보
                    progress_info["current_step"] = "investment"
                    progress_info["message"] = f"{company_name}에 대한 {current_news_num}번째 뉴스의 투자실적 분석을 하고 있습니다."
                    
                    # 분석 결과를 뉴스 정보와 함께 저장
                    analyzed_news.append({
                        "news_info": {
                            "title": title,
                            "description": description,
                            "source": source,
                            "published": published,
                            "link": link
                        },
                        "trend_analysis": {
                            "news_trend_summary": result.get("trend_analysis", {}).get("news_trend_summary", ""),
                            "sentiment_score": result.get("trend_analysis", {}).get("sentiment_score", 0),
                            "sentiment_label": result.get("trend_analysis", {}).get("sentiment_label", "중립")
                        },
                        "award_analysis": {
                            "is_award_related": result.get("award_analysis", {}).get("is_award_related", "N"),
                            "award_reason": result.get("award_analysis", {}).get("award_reason", "")
                        },
                        "investment_analysis": {
                            "is_investment_related": result.get("investment_analysis", {}).get("is_investment_related", "N"),
                            "investment_reason": result.get("investment_analysis", {}).get("investment_reason", "")
                        }
                    })
                    
                    print(f"[DEBUG] 뉴스 {current_news_num} 분석 완료")
                    
                except Exception as e:
                    print(f"[DEBUG] 뉴스 {current_news_num} 분석 중 오류: {str(e)}")
                    # 오류가 발생한 경우 기본값으로 저장
                    analyzed_news.append({
                        "news_info": {
                            "title": title,
                            "description": description,
                            "source": source,
                            "published": published,
                            "link": link
                        },
                        "trend_analysis": {
                            "news_trend_summary": "분석 중 오류가 발생했습니다.",
                            "sentiment_score": 0,
                            "sentiment_label": "중립"
                        },
                        "award_analysis": {
                            "is_award_related": "N",
                            "award_reason": "분석 중 오류가 발생했습니다."
                        },
                        "investment_analysis": {
                            "is_investment_related": "N",
                            "investment_reason": "분석 중 오류가 발생했습니다."
                        }
                    })
                    continue
            
            # 통계 계산 (오류 처리 강화)
            try:
                total_awards = sum(1 for news in analyzed_news if news.get("award_analysis", {}).get("is_award_related") == "Y")
                total_investments = sum(1 for news in analyzed_news if news.get("investment_analysis", {}).get("is_investment_related") == "Y")
                
                # 평균 감정 점수 계산
                sentiment_scores = []
                for news in analyzed_news:
                    try:
                        score = news.get("trend_analysis", {}).get("sentiment_score", 0)
                        if isinstance(score, (int, float)):
                            sentiment_scores.append(score)
                    except Exception as e:
                        print(f"[DEBUG] 감정 점수 추출 중 오류: {str(e)}")
                        sentiment_scores.append(0)
                
                avg_sentiment_score = sum(sentiment_scores) / len(sentiment_scores) if sentiment_scores else 0
            except Exception as e:
                print(f"[DEBUG] 통계 계산 중 오류: {str(e)}")
                total_awards = 0
                total_investments = 0
                avg_sentiment_score = 0
            
            # 종합의견 생성
            progress_info["message"] = "종합의견을 생성하고 있습니다..."
            progress_info["current_step"] = "종합의견 생성 중"
            progress_info["progress"] = int((current_step / total_steps) * 100)
            
            yield f"data: {json.dumps(progress_info)}\n\n"
            
            comprehensive_opinion = self._generate_comprehensive_opinion(company_name, analyzed_news)
            
            # 종합의견 생성 완료 후 진행률을 100%로 설정
            current_step += 1
            progress_info["progress"] = 100
            progress_info["message"] = "분석이 완료되었습니다."
            progress_info["current_step"] = "분석 완료"
            
            yield f"data: {json.dumps(progress_info)}\n\n"
            
            print(f"[DEBUG] 최종 분석 완료 - 총 뉴스: {len(analyzed_news)}, 수상실적: {total_awards}, 투자실적: {total_investments}")
            
            # 최종 결과 데이터 검증 및 정리
            try:
                # 분석된 뉴스 데이터 검증 및 정리
                validated_news = []
                for news in analyzed_news:
                    try:
                        # 필수 필드들이 있는지 확인하고 기본값 설정
                        validated_news_item = {
                            "news_info": {
                                "title": news.get("news_info", {}).get("title", "제목 없음"),
                                "description": news.get("news_info", {}).get("description", "내용 없음"),
                                "source": news.get("news_info", {}).get("source", "출처 없음"),
                                "published": news.get("news_info", {}).get("published", ""),
                                "link": news.get("news_info", {}).get("link", "")
                            },
                            "trend_analysis": {
                                "news_trend_summary": news.get("trend_analysis", {}).get("news_trend_summary", "분석 내용이 없습니다."),
                                "sentiment_score": news.get("trend_analysis", {}).get("sentiment_score", 0),
                                "sentiment_label": news.get("trend_analysis", {}).get("sentiment_label", "중립")
                            },
                            "award_analysis": {
                                "is_award_related": news.get("award_analysis", {}).get("is_award_related", "N"),
                                "award_reason": news.get("award_analysis", {}).get("award_reason", "분석 내용이 없습니다."),
                                "award_name": news.get("award_analysis", {}).get("award_name", "")
                            },
                            "investment_analysis": {
                                "is_investment_related": news.get("investment_analysis", {}).get("is_investment_related", "N"),
                                "investment_reason": news.get("investment_analysis", {}).get("investment_reason", "분석 내용이 없습니다."),
                                "investment_name": news.get("investment_analysis", {}).get("investment_name", "")
                            }
                        }
                        validated_news.append(validated_news_item)
                    except Exception as e:
                        print(f"[DEBUG] 뉴스 데이터 검증 중 오류: {str(e)}")
                        # 오류가 발생한 뉴스는 기본 구조로 추가
                        validated_news.append({
                            "news_info": {
                                "title": "데이터 오류",
                                "description": "뉴스 데이터 처리 중 오류가 발생했습니다.",
                                "source": "오류",
                                "published": "",
                                "link": ""
                            },
                            "trend_analysis": {
                                "news_trend_summary": "분석 중 오류가 발생했습니다.",
                                "sentiment_score": 0,
                                "sentiment_label": "중립"
                            },
                            "award_analysis": {
                                "is_award_related": "N",
                                "award_reason": "분석 중 오류가 발생했습니다.",
                                "award_name": ""
                            },
                            "investment_analysis": {
                                "is_investment_related": "N",
                                "investment_reason": "분석 중 오류가 발생했습니다.",
                                "investment_name": ""
                            }
                        })
                
                # 최종 결과를 yield로 전달
                final_result = {
                    "success": True,
                    "company_name": company_name,
                    "analyzed_news": validated_news,
                    "total_news": len(validated_news),
                    "total_awards": total_awards,
                    "total_investments": total_investments,
                    "avg_sentiment_score": round(avg_sentiment_score, 1),
                    "comprehensive_opinion": comprehensive_opinion,
                    "analysis_type": "comprehensive",
                    "analysis_date": datetime.now().isoformat()
                }
                
                print(f"[DEBUG] 최종 결과 데이터 검증 완료 - 검증된 뉴스: {len(validated_news)}개")
                print(f"[DEBUG] 최종 결과 키들: {list(final_result.keys())}")
                print(f"[DEBUG] 최종 결과 success: {final_result['success']}")
                print(f"[DEBUG] 최종 결과 company_name: {final_result['company_name']}")
                print(f"[DEBUG] 최종 결과 total_news: {final_result['total_news']}")
                
                # 최종 결과를 yield로 전달 (문자열이 아닌 객체로)
                print(f"[DEBUG] 최종 결과를 yield로 전달합니다.")
                yield final_result
                print(f"[DEBUG] 최종 결과 yield 완료")
                
            except Exception as e:
                print(f"[DEBUG] 최종 결과 데이터 검증 중 오류: {str(e)}")
                # 검증 실패 시 기본 결과 반환
                fallback_result = {
                    "success": True,
                    "company_name": company_name,
                    "analyzed_news": analyzed_news,  # 원본 데이터 사용
                    "total_news": len(analyzed_news),
                    "total_awards": total_awards,
                    "total_investments": total_investments,
                    "avg_sentiment_score": round(avg_sentiment_score, 1),
                    "comprehensive_opinion": comprehensive_opinion,
                    "analysis_type": "comprehensive",
                    "analysis_date": datetime.now().isoformat()
                }
                print(f"[DEBUG] 폴백 결과 반환: {list(fallback_result.keys())}")
                yield fallback_result
            
        except Exception as e:
            print(f"[DEBUG] analyze_news_comprehensive 전체 오류: {str(e)}")
            yield f"data: {json.dumps({'type': 'error', 'message': f'분석 중 오류가 발생했습니다: {str(e)}'})}\n\n"
            yield {
                "success": False,
                "message": f"분석 중 오류가 발생했습니다: {str(e)}",
                "analysis_type": "comprehensive"
            }

    def _prepare_news_text(self, news_items):
        """뉴스 아이템들을 분석용 텍스트로 변환"""
        news_text = ""
        for i, news in enumerate(news_items, 1):  # 모든 뉴스 분석
            title = news.get('title', '')
            description = news.get('description', '')
            source = news.get('source', '')
            published = news.get('published', '')
            
            news_text += f"""
뉴스 {i}:
- 제목: {title}
- 내용: {description}
- 출처: {source}
- 날짜: {published}
---
"""
        return news_text

    def _call_chatgpt_with_retry(self, prompt, news_num, max_retries=3):
        """ChatGPT API 호출 with 재시도 로직"""
        import time
        import random
        import traceback
        
        print(f"[DEBUG] ===== 뉴스 {news_num} ChatGPT API 호출 시작 =====")
        print(f"[DEBUG] 모델: {self.model_name}, Temperature: {self.temperature}")
        print(f"[DEBUG] 프롬프트 길이: {len(prompt)}자")
        
        for attempt in range(max_retries):
            try:
                print(f"[DEBUG] 뉴스 {news_num} ChatGPT API 호출 시도 {attempt + 1}/{max_retries}")
                
                response = self.client.chat.completions.create(
                    model=self.model_name,
                    messages=[
                        {"role": "system", "content": "당신은 뉴스 분석 전문가입니다. 정확하고 객관적으로 뉴스를 분석해주세요."},
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=2000,    # 토큰 수 대폭 증가로 더 상세한 분석 가능
                    temperature=self.temperature,    # 설정에서 가져온 temperature 사용
                    timeout=120         # 120초 타임아웃 설정 (긴 본문 처리 고려)
                )
                
                print(f"[DEBUG] 뉴스 {news_num} ChatGPT API 응답 받음")
                
                # 응답 검증
                if not response.choices or not response.choices[0].message.content:
                    error_detail = f"빈 응답 받음 - choices: {bool(response.choices)}"
                    print(f"[ERROR] 뉴스 {news_num} {error_detail}")
                    raise Exception(error_detail)
                
                raw_content = response.choices[0].message.content
                print(f"[DEBUG] 뉴스 {news_num} 응답 내용 길이: {len(raw_content)}자")
                print(f"[DEBUG] 뉴스 {news_num} 응답 내용 (처음 500자): {raw_content[:500]}")
                
                # 강화된 JSON 파싱 함수 사용
                result = self._extract_and_parse_json(raw_content, news_num)
                
                # 결과 검증
                if not result:
                    error_detail = "JSON 파싱 결과가 None"
                    print(f"[ERROR] 뉴스 {news_num} {error_detail}")
                    print(f"[ERROR] 뉴스 {news_num} 원본 응답: {raw_content}")
                    raise Exception(error_detail)
                
                if not isinstance(result, dict):
                    error_detail = f"JSON 파싱 결과가 dict가 아님 - 타입: {type(result)}"
                    print(f"[ERROR] 뉴스 {news_num} {error_detail}")
                    print(f"[ERROR] 뉴스 {news_num} 파싱 결과: {result}")
                    raise Exception(error_detail)
                
                print(f"[DEBUG] 뉴스 {news_num} ChatGPT API 호출 성공")
                print(f"[DEBUG] 뉴스 {news_num} 결과 키: {list(result.keys())}")
                return result
                
            except Exception as e:
                error_msg = str(e).lower()
                error_type = type(e).__name__
                
                print(f"[ERROR] ===== 뉴스 {news_num} ChatGPT API 오류 (시도 {attempt + 1}/{max_retries}) =====")
                print(f"[ERROR] 오류 타입: {error_type}")
                print(f"[ERROR] 오류 메시지: {str(e)}")
                print(f"[ERROR] 오류 상세:")
                print(traceback.format_exc())
                
                # 특정 오류에 대한 처리
                if "rate limit" in error_msg or "quota" in error_msg:
                    print(f"[ERROR] 뉴스 {news_num} Rate limit/quota 오류 - 60-90초 대기")
                    time.sleep(60 + random.uniform(0, 30))  # 60-90초 대기
                elif "timeout" in error_msg or "connection" in error_msg:
                    print(f"[ERROR] 뉴스 {news_num} 연결 오류 - 5-10초 대기")
                    time.sleep(5 + random.uniform(0, 5))  # 5-10초 대기
                elif "api" in error_msg or "auth" in error_msg:
                    print(f"[ERROR] 뉴스 {news_num} API 인증 오류 - 재시도 중단")
                    return None  # API 키 문제는 재시도해도 소용없음
                else:
                    print(f"[ERROR] 뉴스 {news_num} 일반 오류 - 2-5초 대기")
                    time.sleep(2 + random.uniform(0, 3))  # 2-5초 대기
                
                if attempt == max_retries - 1:
                    print(f"[ERROR] ===== 뉴스 {news_num} ChatGPT API 최종 실패 =====")
                    print(f"[ERROR] 최종 오류: {error_type} - {str(e)}")
                    return None
        
        print(f"[ERROR] 뉴스 {news_num} 모든 재시도 실패")
        return None

    def _call_chatgpt_streaming(self, prompt, news_num, step_type):
        """ChatGPT API 호출 with 스트리밍 응답"""
        import time
        import random
        
        try:
            print(f"[DEBUG] 뉴스 {news_num} {step_type} ChatGPT 스트리밍 API 호출")
            
            # AI 응답 시작 알림
            ai_response_start = {
                "type": "ai_response",
                "step": step_type,
                "news_num": news_num,
                "message": f"ChatGPT로부터 {step_type} 분석 응답을 받는 중..."
            }
            yield ai_response_start
            
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": "당신은 뉴스 분석 전문가입니다. 정확하고 객관적으로 뉴스를 분석해주세요."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=2000,    # 토큰 수 대폭 증가로 더 상세한 분석 가능
                temperature=self.temperature,    # 설정된 temperature 사용
                stream=True,  # 스트리밍 활성화
                timeout=120   # 120초 타임아웃 설정 (긴 본문 처리 고려)
            )
            
            full_response = ""
            for chunk in response:
                if chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    full_response += content
                    
                    # 실시간 응답 전송
                    ai_response_chunk = {
                        "type": "ai_response",
                        "step": step_type,
                        "news_num": news_num,
                        "response": full_response,
                        "is_complete": False
                    }
                    yield ai_response_chunk
            
            # 응답 완료 알림
            ai_response_complete = {
                "type": "ai_response",
                "step": step_type,
                "news_num": news_num,
                "response": full_response,
                "is_complete": True
            }
            yield ai_response_complete
            
            # JSON 파싱 시도
            try:
                # gpt-4o 응답 정리 (불필요한 문자 제거)
                cleaned_response = full_response.strip()
                
                # JSON 블록만 추출 (```json ... ``` 형식인 경우)
                if "```json" in cleaned_response and "```" in cleaned_response:
                    start_idx = cleaned_response.find("```json") + 7
                    end_idx = cleaned_response.rfind("```")
                    if end_idx > start_idx:
                        cleaned_response = cleaned_response[start_idx:end_idx].strip()
                
                # 앞뒤 불필요한 문자 제거
                cleaned_response = cleaned_response.strip()
                if cleaned_response.startswith("```"):
                    cleaned_response = cleaned_response[3:].strip()
                if cleaned_response.endswith("```"):
                    cleaned_response = cleaned_response[:-3].strip()
                
                print(f"[DEBUG] 뉴스 {news_num} {step_type} 원본 응답: {full_response}")
                print(f"[DEBUG] 뉴스 {news_num} {step_type} 정리된 응답: {cleaned_response}")
                
                # 강화된 JSON 파싱 함수 사용
                result = self._extract_and_parse_json(cleaned_response, news_num)
                if result and isinstance(result, dict):
                    print(f"[DEBUG] 뉴스 {news_num} {step_type} JSON 파싱 성공: {result}")
                    # 결과를 별도로 yield
                    yield {"type": "result", "data": result}
                    return result
                else:
                    raise Exception("JSON 파싱 실패")
            except Exception as e:
                print(f"[DEBUG] 뉴스 {news_num} {step_type} JSON 파싱 실패")
                print(f"[DEBUG] 원본 응답: {full_response}")
                print(f"[DEBUG] JSON 오류: {str(e)}")
                
                # JSON 파싱 실패 시 기본 결과 반환
                if step_type == "trend":
                    default_result = {
                        "trend_analysis": {
                            "news_trend_summary": "JSON 파싱 실패로 인한 기본 요약",
                            "sentiment_score": 0,
                            "sentiment_label": "중립"
                        }
                    }
                elif step_type == "award":
                    default_result = {
                        "award_analysis": {
                            "is_award_related": "N",
                            "award_name": "",
                            "award_reason": "JSON 파싱 실패로 인한 기본 분석"
                        }
                    }
                elif step_type == "investment":
                    default_result = {
                        "investment_analysis": {
                            "is_investment_related": "N",
                            "investment_name": "",
                            "investment_reason": "JSON 파싱 실패로 인한 기본 분석"
                        }
                    }
                else:
                    default_result = {}
                
                print(f"[DEBUG] 기본 결과 반환: {default_result}")
                yield {"type": "result", "data": default_result}
                return default_result
                
        except Exception as e:
            print(f"[DEBUG] 뉴스 {news_num} {step_type} ChatGPT 스트리밍 API 오류: {str(e)}")
            
            # API 호출 실패 시 기본 결과 반환 (분석 중단 방지)
            if step_type == "trend":
                default_result = {
                    "trend_analysis": {
                        "news_trend_summary": f"API 호출 실패로 인한 기본 요약 (오류: {str(e)[:50]})",
                        "sentiment_score": 0,
                        "sentiment_label": "중립"
                    }
                }
            elif step_type == "award":
                default_result = {
                    "award_analysis": {
                        "is_award_related": "N",
                        "award_name": "",
                        "award_reason": f"API 호출 실패로 인한 기본 분석 (오류: {str(e)[:50]})"
                    }
                }
            elif step_type == "investment":
                default_result = {
                    "investment_analysis": {
                        "is_investment_related": "N",
                        "investment_name": "",
                        "investment_reason": f"API 호출 실패로 인한 기본 분석 (오류: {str(e)[:50]})"
                    }
                }
            else:
                default_result = {}
            
            print(f"[DEBUG] API 오류로 인한 기본 결과 반환: {default_result}")
            yield {"type": "result", "data": default_result}
            return default_result



    def _convert_google_rss_to_original_url(self, rss_url):
        """구글 RSS URL을 원래 기사 URL로 변환합니다.
        
        googlenewsdecoder 패키지를 사용하여 구글 뉴스 URL을 디코딩합니다.
        """
        try:
            import sys
            print(f"[DEBUG] Python 경로: {sys.executable}")
            print(f"[DEBUG] Python 버전: {sys.version}")
            print(f"[DEBUG] Python 경로 목록: {sys.path}")
            
            from googlenewsdecoder import new_decoderv1
            
            print(f"[DEBUG] 구글 RSS URL 변환 시도: {rss_url}")
            
            # 구글 뉴스 URL인지 확인 (rss/articles/ 또는 read/ 포함)
            if not ('news.google.com/rss/articles/' in rss_url or 'news.google.com/read/' in rss_url):
                print(f"[DEBUG] 구글 뉴스 URL이 아님: {rss_url}")
                return None
            
            # googlenewsdecoder를 사용하여 URL 디코딩
            try:
                print(f"[DEBUG] googlenewsdecoder 호출 시작: {rss_url}")
                decoded_result = new_decoderv1(rss_url, interval=5)
                print(f"[DEBUG] googlenewsdecoder 응답: {decoded_result}")
                
                if decoded_result.get("status"):
                    original_url = decoded_result["decoded_url"]
                    print(f"[DEBUG] 구글 뉴스 URL 변환 성공: {rss_url} -> {original_url}")
                    return original_url
                else:
                    print(f"[DEBUG] 구글 뉴스 URL 변환 실패: {decoded_result.get('message', 'Unknown error')}")
                    return None
                    
            except Exception as e:
                print(f"[DEBUG] googlenewsdecoder 오류: {e}")
                print(f"[DEBUG] 오류 타입: {type(e)}")
                import traceback
                print(f"[DEBUG] 오류 상세: {traceback.format_exc()}")
                return None
                
        except ImportError as e:
            print(f"[DEBUG] googlenewsdecoder 패키지 ImportError: {e}")
            print(f"[DEBUG] googlenewsdecoder 패키지가 설치되지 않음, 설치 시도...")
            
            # 패키지 설치 시도
            try:
                import subprocess
                import sys
                print(f"[DEBUG] pip install googlenewsdecoder 시도...")
                result = subprocess.run([sys.executable, "-m", "pip", "install", "googlenewsdecoder"], 
                                      capture_output=True, text=True, timeout=30)
                print(f"[DEBUG] 설치 결과: {result.returncode}")
                print(f"[DEBUG] 설치 출력: {result.stdout}")
                print(f"[DEBUG] 설치 오류: {result.stderr}")
                
                # 설치 후 다시 import 시도
                try:
                    from googlenewsdecoder import new_decoderv1
                    print(f"[DEBUG] 설치 후 import 성공")
                    
                    # googlenewsdecoder를 사용하여 URL 디코딩
                    decoded_result = new_decoderv1(rss_url, interval=5)
                    if decoded_result.get("status"):
                        original_url = decoded_result["decoded_url"]
                        print(f"[DEBUG] 구글 뉴스 URL 변환 성공: {rss_url} -> {original_url}")
                        return original_url
                    else:
                        print(f"[DEBUG] 구글 뉴스 URL 변환 실패: {decoded_result.get('message', 'Unknown error')}")
                        return None
                        
                except Exception as e2:
                    print(f"[DEBUG] 설치 후 import 실패: {e2}")
                    return self._convert_google_rss_to_original_url_fallback(rss_url)
                    
            except Exception as install_error:
                print(f"[DEBUG] 패키지 설치 실패: {install_error}")
                return self._convert_google_rss_to_original_url_fallback(rss_url)
        except Exception as e:
            print(f"[DEBUG] 구글 RSS URL 변환 중 오류: {e}")
            return None
    
    def _convert_google_rss_to_original_url_fallback(self, rss_url):
        """기존 base64 디코딩 방법을 사용한 폴백 함수"""
        try:
            import base64
            import re
            import urllib.parse
            
            print(f"[DEBUG] 폴백 방법 사용: {rss_url}")
            
            # 구글 RSS URL인지 확인
            if 'news.google.com/rss/articles/' not in rss_url:
                print(f"[DEBUG] 구글 RSS URL이 아님: {rss_url}")
                return None
            
            # URL에서 articles/ 다음 부분 추출 (파라미터 제거)
            if '/articles/' not in rss_url:
                print(f"[DEBUG] articles/ 부분을 찾을 수 없음")
                return None
            
            encoded_part = rss_url.split('/articles/')[1].split('?')[0]
            print(f"[DEBUG] 인코딩된 부분 추출: {encoded_part}")
            
            # 다양한 디코딩 방법 시도
            original_url = self._try_decode_methods(encoded_part)
            
            if original_url:
                print(f"[DEBUG] 폴백 방법 성공: {rss_url} -> {original_url}")
                return original_url
            else:
                print(f"[DEBUG] 폴백 방법 실패")
                return None
                
        except Exception as e:
            print(f"[DEBUG] 폴백 방법 오류: {e}")
            return None
    
    def _try_decode_methods(self, encoded_part):
        """여러 디코딩 방법을 시도합니다."""
        import base64
        import re
        import urllib.parse
        
        # 방법 1: 기본 base64 디코딩
        try:
            decoded_bytes = base64.b64decode(encoded_part)
            decoded_url = decoded_bytes.decode('utf-8')
            original_url = self._clean_url(decoded_url)
            if original_url:
                print(f"[DEBUG] 방법 1 (base64) 성공: {original_url}")
                return original_url
        except Exception as e:
            print(f"[DEBUG] 방법 1 (base64) 실패: {e}")
        
        # 방법 2: URL 안전 base64 디코딩
        try:
            # URL 안전 문자를 표준 base64로 변환
            safe_encoded = encoded_part.replace('-', '+').replace('_', '/')
            # 패딩 추가
            while len(safe_encoded) % 4:
                safe_encoded += '='
            
            decoded_bytes = base64.b64decode(safe_encoded)
            decoded_url = decoded_bytes.decode('utf-8')
            original_url = self._clean_url(decoded_url)
            if original_url:
                print(f"[DEBUG] 방법 2 (URL 안전 base64) 성공: {original_url}")
                return original_url
        except Exception as e:
            print(f"[DEBUG] 방법 2 (URL 안전 base64) 실패: {e}")
        
        # 방법 3: URL 디코딩 후 base64 디코딩
        try:
            url_decoded = urllib.parse.unquote(encoded_part)
            decoded_bytes = base64.b64decode(url_decoded)
            decoded_url = decoded_bytes.decode('utf-8')
            original_url = self._clean_url(decoded_url)
            if original_url:
                print(f"[DEBUG] 방법 3 (URL 디코딩 + base64) 성공: {original_url}")
                return original_url
        except Exception as e:
            print(f"[DEBUG] 방법 3 (URL 디코딩 + base64) 실패: {e}")
        
        # 방법 4: 직접 URL 패턴 찾기
        try:
            # URL 패턴이 직접 포함되어 있는지 확인
            url_pattern = r'https?://[^\s<>"{}|\\^`\[\]]+'
            matches = re.findall(url_pattern, encoded_part)
            if matches:
                original_url = self._clean_url(matches[0])
                if original_url:
                    print(f"[DEBUG] 방법 4 (직접 URL 패턴) 성공: {original_url}")
                    return original_url
        except Exception as e:
            print(f"[DEBUG] 방법 4 (직접 URL 패턴) 실패: {e}")
        
        return None
    
    def _clean_url(self, url):
        """URL을 정리하고 유효성을 검사합니다."""
        import re
        try:
            # 불필요한 문자 제거
            url = url.strip('"\' \t\n\r')
            
            # http로 시작하는 부분 찾기
            if url.startswith('http'):
                clean_url = url
            else:
                return None
            
            # URL 유효성 검사
            if re.match(r'^https?://[^\s<>"{}|\\^`\[\]]+$', clean_url):
                return clean_url
            else:
                return None
                
        except Exception as e:
            print(f"[DEBUG] URL 정리 중 오류: {e}")
            return None
                
        except Exception as e:
            print(f"[DEBUG] 구글 RSS URL 변환 중 오류: {e}")
            return None



    def _fetch_article_content(self, url):
        """기사 링크에서 본문을 가져옵니다. (네이버 뉴스용)"""
        try:
            import requests
            from bs4 import BeautifulSoup
            import re
            
            # 요청 헤더 설정
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
            
            # 요청 타임아웃 설정
            response = requests.get(url, headers=headers, timeout=5)
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
            
            # BeautifulSoup으로 파싱
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # 불필요한 요소 제거
            unwanted_elements = [
                'script', 'style', 'nav', 'header', 'footer', 'aside', 
                'noscript', 'iframe', 'embed', 'object', 'applet',
                '.advertisement', '.ad', '.ads', '.banner', '.sidebar',
                '.comment', '.comments', '.social-share', '.share-buttons',
                '.related-articles', '.recommend', '.trending',
                '.breadcrumb', '.pagination', '.navigation'
            ]
            
            for element in soup(unwanted_elements):
                element.decompose()
            
            # 본문 추출 (네이버 뉴스 특화 선택자)
            content_selectors = [
                # 네이버 뉴스 특화 선택자
                '#articleBody', '.article_body', '.article-content',
                '.news_end', '.news_end_wrp', '.end_body_wrp',
                '.article_body_wrp', '.article_body_wrp .end_body_wrp',
                
                # 일반적인 뉴스 사이트 선택자
                'article', '.article-content', '.news-content', '.content',
                '.post-content', '.entry-content', '.story-content',
                '#content', '#article-content', '#news-content',
                '.article-body', '.news-body', '.story-body',
                '.main-content', '.post-body', '.entry-body',
                '.article-text', '.news-text', '.story-text',
                '.article-main', '.news-main', '.story-main',
                '.article', '.news', '.story'
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
                        print(f"[DEBUG] 선택자 '{selector}'에서 본문 찾음: {len(content)}자")
                        break
            
            # 본문을 찾지 못한 경우 p 태그들에서 추출
            if not content or len(content) < 300:
                paragraphs = soup.find_all('p')
                texts = []
                for p in paragraphs:
                    text = p.get_text().strip()
                    if len(text) > 30 and not any(keyword in text.lower() for keyword in [
                        '광고', 'advertisement', 'sponsored', 'promotion',
                        '메뉴', 'menu', '네비게이션', 'navigation',
                        '로그인', 'login', '회원가입', 'signup',
                        '댓글', 'comment', '공유', 'share',
                        'copyright', '저작권', 'all rights reserved'
                    ]):
                        texts.append(text)
                content = ' '.join(texts)
                print(f"[DEBUG] p 태그에서 본문 추출: {len(content)}자")
            
            # 텍스트 정리
            if content:
                content = re.sub(r'\s+', ' ', content)
                content = content.strip()
                content = re.sub(r'이전 기사보기.*?다음 기사보기', '', content, flags=re.DOTALL)
                content = re.sub(r'바로가기.*?복사하기', '', content, flags=re.DOTALL)
                content = re.sub(r'본문 글씨 줄이기.*?본문 글씨 키우기', '', content, flags=re.DOTALL)
                content = re.sub(r'스크롤 이동.*?상태바', '', content, flags=re.DOTALL)
                content = re.sub(r'│촬영.*?뉴스', '', content, flags=re.DOTALL)
                content = re.sub(r'사진.*?제공', '', content, flags=re.DOTALL)
                content = re.sub(r'\(사진.*?\)', '', content, flags=re.DOTALL)
                
                content = re.sub(r'\s+', ' ', content)
                content = content.strip()
                
                if len(content) < 100:
                    print(f"[DEBUG] 본문이 너무 짧음: {len(content)}자")
                    return None
                
                if len(content) > 30000:
                    print(f"[DEBUG] 본문이 너무 길어서 자름: {len(content)}자 -> 30000자")
                    content = content[:30000] + "..."
            
            print(f"[DEBUG] 기사 본문 가져오기 성공: {len(content)}자")
            return content
            
        except Exception as e:
            print(f"[DEBUG] 기사 본문 가져오기 실패: {e}")
            return None

    def analyze_news_comprehensive_streaming(self, company_name, news_items):
        """뉴스별 종합 분석 (스트리밍 버전) - 배치 처리 및 안정성 개선"""
        print(f"[DEBUG] analyze_news_comprehensive_streaming 시작 - 회사: {company_name}, 뉴스 개수: {len(news_items)}")
        
        if not news_items:
            print("[DEBUG] 뉴스 아이템이 없음")
            yield f"data: {json.dumps({'type': 'error', 'message': '분석할 뉴스가 없습니다.'})}\n\n"
            yield {
                "success": False,
                "message": "분석할 뉴스가 없습니다."
            }
            return
        
        try:
            analyzed_news = []
            
            # 뉴스 기간 계산
            dates = [news.get('published', '') for news in news_items if news.get('published')]
            if dates:
                start_date = min(dates)
                end_date = max(dates)
            else:
                start_date = "날짜 정보 없음"
                end_date = "날짜 정보 없음"
            
            # 배치 크기 설정 (한 번에 처리할 뉴스 수)
            # 뉴스 개수에 따라 배치 크기 동적 조정
            if len(news_items) > 1000:
                BATCH_SIZE = 30  # 1000개 이상: 30개씩 (더 안정적)
            elif len(news_items) > 500:
                BATCH_SIZE = 40  # 500개 이상: 40개씩
            else:
                BATCH_SIZE = 50  # 기본: 50개씩 배치 처리
            total_batches = (len(news_items) + BATCH_SIZE - 1) // BATCH_SIZE
            
            # 총 단계 수 계산 (배치 수 × 3단계 + 종합의견 1단계)
            total_steps = total_batches * 3 + 1
            current_step = 0
            
            # 초기 진행 정보
            progress_info = {
                "type": "progress",
                "company_name": company_name,
                "total_news": len(news_items),
                "start_date": start_date,
                "end_date": end_date,
                "current_batch": 0,
                "total_batches": total_batches,
                "current_step": "",
                "message": f"{company_name} 기업관련 {start_date} ~ {end_date} 까지 {len(news_items)}건의 뉴스를 {total_batches}개 배치로 분석합니다. (배치 크기: {BATCH_SIZE}개)",
                "progress": 0
            }
            
            yield f"data: {json.dumps(progress_info)}\n\n"
            
            # 배치별로 뉴스 분석
            for batch_idx in range(total_batches):
                start_idx = batch_idx * BATCH_SIZE
                end_idx = min((batch_idx + 1) * BATCH_SIZE, len(news_items))
                batch_news = news_items[start_idx:end_idx]
                
                current_batch_num = batch_idx + 1
                print(f"[DEBUG] 배치 {current_batch_num}/{total_batches} 분석 시작 (뉴스 {start_idx+1}~{end_idx})")
                
                # 진행 정보 업데이트
                progress_info["current_batch"] = current_batch_num
                progress_info["current_news"] = start_idx + 1  # 배치 시작 뉴스 번호
                progress_info["message"] = f"배치 {current_batch_num}/{total_batches} 시작... (뉴스 {start_idx+1}~{end_idx} 분석 예정)"
                progress_info["current_step"] = "배치 분석 시작"
                progress_info["progress"] = int((current_step / total_steps) * 100)
                
                yield f"data: {json.dumps(progress_info)}\n\n"
                
                # 배치 내 각 뉴스 분석
                for i, news in enumerate(batch_news):
                    current_news_num = start_idx + i + 1
                    print(f"[DEBUG] 뉴스 {current_news_num} 종합 분석 중...")
                    
                    # 개별 뉴스 분석 시작 시 진행 정보 업데이트
                    progress_info["current_news"] = current_news_num
                    progress_info["message"] = f"뉴스 {current_news_num}/{len(news_items)} 분석 중... (배치 {current_batch_num}/{total_batches})"
                    progress_info["current_step"] = "개별 뉴스 분석"
                    progress_info["progress"] = int((current_step / total_steps) * 100)
                    
                    yield f"data: {json.dumps(progress_info)}\n\n"
                    
                    # 각 뉴스 분석 시작 시 _original_url_for_web_search 초기화
                    self._original_url_for_web_search = None
                    
                    try:
                        # 뉴스 데이터 추출
                        title = news.get('title', '')
                        content = news.get('content', '') or news.get('description', '')
                        source = news.get('source', '')
                        published = news.get('published', '')
                        link = news.get('link', '')
                        
                        print(f"[DEBUG] 뉴스 제목: {title[:50]}...")
                        print(f"[DEBUG] 원본 content 길이: {len(content)}자")
                        
                        # 네이버 뉴스 또는 구글 뉴스인 경우 전체 본문 가져오기
                        is_naver = link and ('news.naver.com' in link or 'n.news.naver.com' in link)
                        is_google = link and 'news.google.com' in link
                        
                        if is_naver or (is_google and content == title):
                            if is_naver:
                                print(f"[DEBUG] 뉴스 {current_news_num} 네이버 뉴스 - 전체 본문 가져오기 시도...")
                            else:
                                print(f"[DEBUG] 뉴스 {current_news_num} 구글 뉴스 (content 없음) - 전체 본문 가져오기 시도...")
                            
                            full_content = self._fetch_article_content(link)
                            if full_content and len(full_content) > len(content):
                                print(f"[DEBUG] ✓ 전체 본문 사용: {len(full_content)}자")
                                content = full_content
                            else:
                                print(f"[DEBUG] ✗ 전체 본문 가져오기 실패, 요약본 사용: {len(content)}자")
                        else:
                            print(f"[DEBUG] 원본 링크 - 요약본 사용: {len(content)}자")
                        
                        # 구글 뉴스인 경우 원본 URL 저장
                        if 'news.google.com' in link:
                            self._original_url_for_web_search = link
                            print(f"[DEBUG] 구글 뉴스 감지: {link}")
                        
                        # 뉴스 분석 실행
                        analysis_result = self._analyze_single_news_with_retry(
                            company_name, title, content, source, published, link, current_news_num
                        )
                        
                        if analysis_result:
                            analyzed_news.append(analysis_result)
                            print(f"[DEBUG] 뉴스 {current_news_num} 분석 완료")
                        else:
                            print(f"[DEBUG] 뉴스 {current_news_num} 분석 실패 - 기본값 사용")
                            # 기본값으로 분석 결과 추가
                            default_result = self._create_default_news_analysis(title, content, source, published, link, current_news_num)
                            analyzed_news.append(default_result)
                        
                    except Exception as e:
                        print(f"[DEBUG] 뉴스 {current_news_num} 분석 중 예외 발생: {str(e)}")
                        # 예외 발생 시에도 기본값으로 분석 결과 추가
                        try:
                            title = news.get('title', '')
                            content = news.get('content', '')
                            source = news.get('source', '')
                            published = news.get('published', '')
                            link = news.get('link', '')
                            default_result = self._create_default_news_analysis(title, content, source, published, link, current_news_num)
                            analyzed_news.append(default_result)
                        except Exception as default_error:
                            print(f"[DEBUG] 뉴스 {current_news_num} 기본값 생성도 실패: {str(default_error)}")
                            # 최후의 수단으로 최소한의 구조라도 추가
                            analyzed_news.append({
                                "news_info": {"title": "오류", "description": "분석 중 오류 발생", "source": "오류", "published": "", "link": ""},
                                "trend_analysis": {"news_trend_summary": "분석 오류", "sentiment_score": 0, "sentiment_label": "중립"},
                                "award_analysis": {"is_award_related": "N", "award_reason": "분석 오류", "award_name": ""},
                                "investment_analysis": {"is_investment_related": "N", "investment_reason": "분석 오류", "investment_name": ""}
                            })
                
                # 배치 완료 후 메모리 정리
                print(f"[DEBUG] 배치 {current_batch_num}/{total_batches} 완료 - 메모리 정리 시작")
                try:
                    import gc
                    gc.collect()  # 가비지 컬렉션 강제 실행
                    print(f"[DEBUG] 배치 {current_batch_num} 메모리 정리 완료")
                except Exception as gc_error:
                    print(f"[DEBUG] 메모리 정리 중 오류: {str(gc_error)}")
                
                current_step += 3  # 배치당 3단계 (동향, 수상, 투자)
            
            # 통계 계산 (오류 처리 강화)
            try:
                total_awards = sum(1 for news in analyzed_news if news.get("award_analysis", {}).get("is_award_related") == "Y")
                total_investments = sum(1 for news in analyzed_news if news.get("investment_analysis", {}).get("is_investment_related") == "Y")
                
                # 평균 감정 점수 계산
                sentiment_scores = []
                for news in analyzed_news:
                    try:
                        score = news.get("trend_analysis", {}).get("sentiment_score", 0)
                        if isinstance(score, (int, float)):
                            sentiment_scores.append(score)
                    except Exception as e:
                        print(f"[DEBUG] 감정 점수 추출 중 오류: {str(e)}")
                        sentiment_scores.append(0)
                
                avg_sentiment_score = sum(sentiment_scores) / len(sentiment_scores) if sentiment_scores else 0
            except Exception as e:
                print(f"[DEBUG] 통계 계산 중 오류: {str(e)}")
                total_awards = 0
                total_investments = 0
                avg_sentiment_score = 0
            
            # 종합의견 생성
            progress_info["message"] = "종합의견을 생성하고 있습니다..."
            progress_info["current_step"] = "종합의견 생성 중"
            progress_info["progress"] = int((current_step / total_steps) * 100)
            
            yield f"data: {json.dumps(progress_info)}\n\n"
            
            comprehensive_opinion = self._generate_comprehensive_opinion(company_name, analyzed_news)
            
            # 종합의견 생성 완료 후 진행률을 100%로 설정
            current_step += 1
            progress_info["progress"] = 100
            progress_info["message"] = "분석이 완료되었습니다."
            progress_info["current_step"] = "분석 완료"
            
            yield f"data: {json.dumps(progress_info)}\n\n"
            
            print(f"[DEBUG] 최종 분석 완료 - 총 뉴스: {len(analyzed_news)}, 수상실적: {total_awards}, 투자실적: {total_investments}")
            
            # 최종 결과 데이터 검증 및 정리
            try:
                # 분석된 뉴스 데이터 검증 및 정리
                validated_news = []
                for news in analyzed_news:
                    try:
                        # 필수 필드들이 있는지 확인하고 기본값 설정
                        validated_news_item = {
                            "news_info": {
                                "title": news.get("news_info", {}).get("title", "제목 없음"),
                                "description": news.get("news_info", {}).get("description", "내용 없음"),
                                "source": news.get("news_info", {}).get("source", "출처 없음"),
                                "published": news.get("news_info", {}).get("published", ""),
                                "link": news.get("news_info", {}).get("link", "")
                            },
                            "trend_analysis": {
                                "news_trend_summary": news.get("trend_analysis", {}).get("news_trend_summary", "분석 내용이 없습니다."),
                                "sentiment_score": news.get("trend_analysis", {}).get("sentiment_score", 0),
                                "sentiment_label": news.get("trend_analysis", {}).get("sentiment_label", "중립")
                            },
                            "award_analysis": {
                                "is_award_related": news.get("award_analysis", {}).get("is_award_related", "N"),
                                "award_reason": news.get("award_analysis", {}).get("award_reason", "분석 내용이 없습니다."),
                                "award_name": news.get("award_analysis", {}).get("award_name", "")
                            },
                            "investment_analysis": {
                                "is_investment_related": news.get("investment_analysis", {}).get("is_investment_related", "N"),
                                "investment_reason": news.get("investment_analysis", {}).get("investment_reason", "분석 내용이 없습니다."),
                                "investment_name": news.get("investment_analysis", {}).get("investment_name", "")
                            }
                        }
                        validated_news.append(validated_news_item)
                    except Exception as e:
                        print(f"[DEBUG] 뉴스 데이터 검증 중 오류: {str(e)}")
                        # 오류가 발생한 뉴스는 기본 구조로 추가
                        validated_news.append({
                            "news_info": {
                                "title": "데이터 오류",
                                "description": "뉴스 데이터 처리 중 오류가 발생했습니다.",
                                "source": "오류",
                                "published": "",
                                "link": ""
                            },
                            "trend_analysis": {
                                "news_trend_summary": "분석 중 오류가 발생했습니다.",
                                "sentiment_score": 0,
                                "sentiment_label": "중립"
                            },
                            "award_analysis": {
                                "is_award_related": "N",
                                "award_reason": "분석 중 오류가 발생했습니다.",
                                "award_name": ""
                            },
                            "investment_analysis": {
                                "is_investment_related": "N",
                                "investment_reason": "분석 중 오류가 발생했습니다.",
                                "investment_name": ""
                            }
                        })
                
                # 최종 결과를 yield로 전달
                final_result = {
                    "success": True,
                    "company_name": company_name,
                    "analyzed_news": validated_news,
                    "total_news": len(validated_news),
                    "total_awards": total_awards,
                    "total_investments": total_investments,
                    "avg_sentiment_score": round(avg_sentiment_score, 1),
                    "comprehensive_opinion": comprehensive_opinion,
                    "analysis_type": "comprehensive",
                    "analysis_date": datetime.now().isoformat()
                }
                
                print(f"[DEBUG] 최종 결과 데이터 검증 완료 - 검증된 뉴스: {len(validated_news)}개")
                print(f"[DEBUG] 최종 결과 키들: {list(final_result.keys())}")
                print(f"[DEBUG] 최종 결과 success: {final_result['success']}")
                print(f"[DEBUG] 최종 결과 company_name: {final_result['company_name']}")
                print(f"[DEBUG] 최종 결과 total_news: {final_result['total_news']}")
                
                # 최종 결과를 yield로 전달 (문자열이 아닌 객체로)
                print(f"[DEBUG] 최종 결과를 yield로 전달합니다.")
                yield final_result
                print(f"[DEBUG] 최종 결과 yield 완료")
                
            except Exception as e:
                print(f"[DEBUG] 최종 결과 데이터 검증 중 오류: {str(e)}")
                # 검증 실패 시 기본 결과 반환
                fallback_result = {
                    "success": True,
                    "company_name": company_name,
                    "analyzed_news": analyzed_news,  # 원본 데이터 사용
                    "total_news": len(analyzed_news),
                    "total_awards": total_awards,
                    "total_investments": total_investments,
                    "avg_sentiment_score": round(avg_sentiment_score, 1),
                    "comprehensive_opinion": comprehensive_opinion,
                    "analysis_type": "comprehensive",
                    "analysis_date": datetime.now().isoformat()
                }
                print(f"[DEBUG] 폴백 결과 반환: {list(fallback_result.keys())}")
                yield fallback_result
            
        except Exception as e:
            print(f"[DEBUG] analyze_news_comprehensive_streaming 전체 오류: {str(e)}")
            yield f"data: {json.dumps({'type': 'error', 'message': f'분석 중 오류가 발생했습니다: {str(e)}'})}\n\n"
            yield {
                "success": False,
                "message": f"분석 중 오류가 발생했습니다: {str(e)}",
                "analysis_type": "comprehensive"
            }

    def _analyze_single_news_with_retry(self, company_name, title, content, source, published, link, current_news_num, max_retries=3):
        """단일 뉴스 분석 (재시도 메커니즘 포함)"""
        for attempt in range(max_retries):
            try:
                result = self._analyze_single_news(company_name, title, content, source, published, link, current_news_num)
                
                # 결과 검증
                if result and isinstance(result, dict):
                    # 필수 필드들이 있는지 확인
                    required_fields = ['news_info', 'trend_analysis', 'award_analysis', 'investment_analysis']
                    if all(field in result for field in required_fields):
                        print(f"[DEBUG] 뉴스 {current_news_num} 분석 성공")
                        return result
                    else:
                        print(f"[DEBUG] 뉴스 {current_news_num} 분석 결과에 필수 필드 누락")
                        raise Exception("분석 결과에 필수 필드가 누락되었습니다")
                else:
                    print(f"[DEBUG] 뉴스 {current_news_num} 분석 결과가 유효하지 않음")
                    raise Exception("분석 결과가 유효하지 않습니다")
                    
            except Exception as e:
                print(f"[DEBUG] 뉴스 {current_news_num} 분석 시도 {attempt + 1}/{max_retries} 실패: {str(e)}")
                if attempt == max_retries - 1:
                    # 마지막 시도 실패 시 기본값 반환
                    print(f"[DEBUG] 뉴스 {current_news_num} 최종 실패 - 기본값 반환")
                    return self._create_default_news_analysis(title, content, source, published, link, current_news_num)
                # 재시도 전 잠시 대기
                import time
                time.sleep(2 ** attempt)  # 지수 백오프
        
        # 모든 시도 실패 시 기본값 반환
        return self._create_default_news_analysis(title, content, source, published, link, current_news_num)

    def _create_default_news_analysis(self, title, content, source, published, link, current_news_num):
        """기본 뉴스 분석 결과 생성"""
        print(f"[DEBUG] 뉴스 {current_news_num} 기본 분석 결과 생성")
        return {
            "news_info": {
                "title": title or "제목 없음",
                "description": content or "내용 없음",
                "source": source or "출처 없음",
                "published": published or "",
                "link": link or ""
            },
            "trend_analysis": {
                "news_trend_summary": "분석 중 오류가 발생하여 기본 요약을 제공합니다.",
                "sentiment_score": 0,
                "sentiment_label": "중립"
            },
            "award_analysis": {
                "is_award_related": "N",
                "award_reason": "분석 중 오류가 발생했습니다.",
                "award_name": ""
            },
            "investment_analysis": {
                "is_investment_related": "N",
                "investment_reason": "분석 중 오류가 발생했습니다.",
                "investment_name": ""
            }
        }

    def _analyze_single_news(self, company_name, title, content, source, published, link, current_news_num):
        """단일 뉴스 분석 (3가지 분석: 동향실적, 수상실적, 투자실적)"""
        print(f"[DEBUG] 뉴스 {current_news_num} 분석 시작: {len(content)}자")
        
        # 구글 뉴스인 경우 web_search_preview 사용
        print(f"[DEBUG] _original_url_for_web_search 확인: {getattr(self, '_original_url_for_web_search', 'None')}")
        if hasattr(self, '_original_url_for_web_search') and self._original_url_for_web_search:
            print(f"[DEBUG] 구글 뉴스 - web_search_preview 방식으로 분석")
            return self._analyze_google_news_with_web_search(company_name, title, content, source, published, link, current_news_num)
        
        # 일반 뉴스 분석 (기존 방식)
        print(f"[DEBUG] 일반 뉴스 - 기존 방식으로 분석")
        news_text = f"""
뉴스 제목: {title}
뉴스 내용: {content}
출처: {source}
날짜: {published}
링크: {link}
"""
        
        # 1. 동향실적 분석
        trend_prompt = f"""
다음은 '{company_name}' 회사에 대한 뉴스입니다. 이 뉴스의 동향실적을 분석해주세요. 

분석 요구사항:
1. 뉴스의 내용을 요약
2. 긍정/부정 점수 매기기 (-10: 매우 부정적, 0: 중립, 10: 매우 긍정적)
- 긍정/부정 점수는 뉴스 내용의 전반적인 톤과 회사에 미치는 영향을 고려하여 판단해주세요.
점수 기준:
- 8~10: 매우 긍정적 (혁신적 성과, 시장 지배력 확대, 매출/이익 대폭 증가 등)
- 4~7: 긍정적 (성장, 수상, 투자 유치, 긍정적 전망 등)
- 1~3: 약간 긍정적 (소폭 개선, 안정적 운영 등)
- 0: 중립 (정보 제공, 사실 전달 등)
- -1~-3: 약간 부정적 (소폭 하락, 경쟁 압박 등)
- -4~-7: 부정적 (실적 악화, 규제 압박, 경쟁 우위 상실 등)
- -8~-10: 매우 부정적 (심각한 위기, 매출 급감, 경영 위기 등)

뉴스 내용:
{news_text}

반드시!!! 다음 JSON 형식으로 응답해주세요. 다른형식으로 응답하면 처리를 할수 없습니다.:
{{
    "trend_analysis": {{
        "news_trend_summary": "뉴스의 내용을 요약한 내용",
        "sentiment_score": -10 ~ 10 사이의 정수,
        "sentiment_label": "매우 긍정적" or "긍정적" or "중립" or "부정적" or "매우 부정적"
    }}
}}
"""
        
        # 동향실적 분석
        trend_result = None
        try:
            print(f"[DEBUG] ===== 뉴스 {current_news_num} 동향실적 분석 시작 =====")
            trend_result = self._call_chatgpt_with_retry(trend_prompt, current_news_num)
            if not trend_result:
                error_detail = "동향실적 분석 결과가 None - ChatGPT API 호출 실패"
                print(f"[ERROR] 뉴스 {current_news_num} {error_detail}")
                raise Exception(error_detail)
            print(f"[DEBUG] 뉴스 {current_news_num} 동향실적 분석 성공")
        except Exception as e:
            import traceback
            print(f"[ERROR] ===== 뉴스 {current_news_num} 동향실적 분석 중 오류 =====")
            print(f"[ERROR] 오류 타입: {type(e).__name__}")
            print(f"[ERROR] 오류 메시지: {str(e)}")
            print(f"[ERROR] 오류 상세:")
            print(traceback.format_exc())
            trend_result = {
                "trend_analysis": {
                    "news_trend_summary": f"동향실적 분석 중 오류 발생: {type(e).__name__} - {str(e)[:100]}",
                    "sentiment_score": 0,
                    "sentiment_label": "중립"
                }
            }
        
        # 2. 수상실적 분석
        award_prompt = f"""
다음은 '{company_name}' 회사에 대한 뉴스입니다. 이 뉴스에서 수상을 받았는지 찾아주세요. 반드시 '{company_name}' 회사가 직접 받은 수상 받은 수상이어야 합니다.

분석 요구사항:
1. 수상 관련 뉴스인지 판단 (상, 시상, 수상, 어워드, award, prize 등)
2. 수상을 받았으면 구체적인 수상명을 찾아주세요
3. 수상을 받았다고 판단한 이유 설명

뉴스 내용:
{news_text}

반드시!!! 다음 JSON 형식으로 응답해주세요. 다른형식으로 응답하면 처리를 할수 없습니다.:
{{
    "award_analysis": {{
        "is_award_related": "Y" or "N",
        "award_name": "구체적인 수상명 (수상 관련이 아닌 경우 빈 문자열)",
        "award_reason": "수상을 받았다고 판단한 이유 설명"
    }}
}}
"""
        
        # 수상실적 분석 (일반 방식으로 변경)
        award_result = None
        try:
            print(f"[DEBUG] ===== 뉴스 {current_news_num} 수상실적 분석 시작 =====")
            award_result = self._call_chatgpt_with_retry(award_prompt, current_news_num)
            if not award_result:
                error_detail = "수상실적 분석 결과가 None - ChatGPT API 호출 실패"
                print(f"[ERROR] 뉴스 {current_news_num} {error_detail}")
                raise Exception(error_detail)
            print(f"[DEBUG] 뉴스 {current_news_num} 수상실적 분석 성공")
        except Exception as e:
            import traceback
            print(f"[ERROR] ===== 뉴스 {current_news_num} 수상실적 분석 중 오류 =====")
            print(f"[ERROR] 오류 타입: {type(e).__name__}")
            print(f"[ERROR] 오류 메시지: {str(e)}")
            print(f"[ERROR] 오류 상세:")
            print(traceback.format_exc())
            award_result = {
                "award_analysis": {
                    "is_award_related": "N",
                    "award_name": "",
                    "award_reason": f"수상실적 분석 중 오류 발생: {type(e).__name__} - {str(e)[:100]}"
                }
            }
        
        # 3. 투자실적 분석
        investment_prompt = f"""
다음은 '{company_name}' 회사에 대한 뉴스입니다. 이 뉴스에서 투자 관련 정보를 찾아주세요. 반드시 '{company_name}' 회사가 직접 받거나 포함되어 받은 투자여야 합니다.

분석 요구사항:
1. 투자 관련 뉴스인지 판단 (투자유치, 투자, 펀딩, funding, 시리즈A/B/C, IPO 등)
2. 투자 관련이면 구체적인 투자명이나 투자 유형을 찾아주세요
3. 투자 관련이면 이유 설명

뉴스 내용:
{news_text}

반드시!!! 다음 JSON 형식으로 응답해주세요. 다른형식으로 응답하면 처리를 할수 없습니다.:
{{
    "investment_analysis": {{
        "is_investment_related": "Y" or "N",
        "investment_name": "구체적인 투자명이나 투자 유형 (투자 관련이 아닌 경우 빈 문자열)",
        "investment_reason": "투자실적 여부에 대한 이유 설명"
    }}
}}
"""
        
        # 투자실적 분석 (일반 방식으로 변경)
        investment_result = None
        try:
            print(f"[DEBUG] ===== 뉴스 {current_news_num} 투자실적 분석 시작 =====")
            investment_result = self._call_chatgpt_with_retry(investment_prompt, current_news_num)
            if not investment_result:
                error_detail = "투자실적 분석 결과가 None - ChatGPT API 호출 실패"
                print(f"[ERROR] 뉴스 {current_news_num} {error_detail}")
                raise Exception(error_detail)
            print(f"[DEBUG] 뉴스 {current_news_num} 투자실적 분석 성공")
        except Exception as e:
            import traceback
            print(f"[ERROR] ===== 뉴스 {current_news_num} 투자실적 분석 중 오류 =====")
            print(f"[ERROR] 오류 타입: {type(e).__name__}")
            print(f"[ERROR] 오류 메시지: {str(e)}")
            print(f"[ERROR] 오류 상세:")
            print(traceback.format_exc())
            investment_result = {
                "investment_analysis": {
                    "is_investment_related": "N",
                    "investment_name": "",
                    "investment_reason": f"투자실적 분석 중 오류 발생: {type(e).__name__} - {str(e)[:100]}"
                }
            }
        
        # 분석 결과를 뉴스 정보와 함께 저장
        return {
            "news_info": {
                "title": title,
                "description": content,
                "source": source,
                "published": published,
                "link": link
            },
            "trend_analysis": {
                "news_trend_summary": trend_result.get("trend_analysis", {}).get("news_trend_summary", "") if trend_result else "분석 중 오류가 발생했습니다.",
                "sentiment_score": trend_result.get("trend_analysis", {}).get("sentiment_score", 0) if trend_result else 0,
                "sentiment_label": trend_result.get("trend_analysis", {}).get("sentiment_label", "중립") if trend_result else "중립"
            },
            "award_analysis": {
                "is_award_related": award_result.get("award_analysis", {}).get("is_award_related", "N") if award_result else "N",
                "award_reason": award_result.get("award_analysis", {}).get("award_reason", "") if award_result else "분석 중 오류가 발생했습니다.",
                "award_name": award_result.get("award_analysis", {}).get("award_name", "") if award_result else ""
            },
            "investment_analysis": {
                "is_investment_related": investment_result.get("investment_analysis", {}).get("is_investment_related", "N") if investment_result else "N",
                "investment_reason": investment_result.get("investment_analysis", {}).get("investment_reason", "") if investment_result else "분석 중 오류가 발생했습니다.",
                "investment_name": investment_result.get("investment_analysis", {}).get("investment_name", "") if investment_result else ""
            }
        }

    def _analyze_google_news_with_web_search(self, company_name, title, content, source, published, link, current_news_num):
        """구글 뉴스 web_search_preview 방식 분석"""
        print(f"[DEBUG] 구글 뉴스 web_search_preview 분석 시작: {current_news_num}")
        
        original_url = self._original_url_for_web_search
        print(f"[DEBUG] 원문 URL: {original_url}")
        
        # 1. 동향실적 분석 (web_search_preview 사용)
        trend_prompt = f"""
{content}

기사 원본 링크의 내용을 분석해서 동향을 분석해 주세요.

분석 요구사항:
1. 기사 원본 링크에 직접 접근하여 전체 기사 내용을 분석
2. 뉴스의 내용을 요약
3. 긍정/부정 점수 매기기 (-10: 매우 부정적, 0: 중립, 10: 매우 긍정적)
점수 기준:
- 8~10: 매우 긍정적 (혁신적 성과, 시장 지배력 확대, 매출/이익 대폭 증가 등)
- 4~7: 긍정적 (성장, 수상, 투자 유치, 긍정적 전망 등)
- 1~3: 약간 긍정적 (소폭 개선, 안정적 운영 등)
- 0: 중립 (정보 제공, 사실 전달 등)
- -1~-3: 약간 부정적 (소폭 하락, 경쟁 압박 등)
- -4~-7: 부정적 (실적 악화, 규제 압박, 경쟁 우위 상실 등)
- -8~-10: 매우 부정적 (심각한 위기, 매출 급감, 경영 위기 등)

반드시!!! 다음 JSON 형식으로 응답해주세요. 다른형식으로 응답하면 처리를 할수 없습니다.:
{{
    "trend_analysis": {{
        "news_trend_summary": "기사 내용을 요약한 내용",
        "sentiment_score": -10 ~ 10 사이의 정수,
        "sentiment_label": "매우 긍정적" or "긍정적" or "중립" or "부정적" or "매우 부정적"
    }}
}}
"""
        
        # 동향실적 분석 (web_search_preview 사용)
        trend_result = None
        try:
            trend_result = self._call_chatgpt_with_web_search(trend_prompt, current_news_num)
            if not trend_result:
                raise Exception("동향실적 분석 결과가 없습니다")
        except Exception as e:
            print(f"[DEBUG] 뉴스 {current_news_num} 동향실적 분석 중 오류: {str(e)}")
            trend_result = {
                "trend_analysis": {
                    "news_trend_summary": f"동향실적 분석 중 오류 발생: {str(e)[:50]}",
                    "sentiment_score": 0,
                    "sentiment_label": "중립"
                }
            }
        
        # 2. 수상실적 분석 (web_search_preview 사용)
        award_prompt = f"""
{content}

기사 원본 링크의 내용을 분석해서 수상실적을 파악해주세요.

분석 요구사항:
1. 기사 원본 링크에 직접 접근하여 전체 기사 내용을 분석
2. 수상 관련 뉴스인지 판단 (상, 시상, 수상, 어워드, award, prize, 혁신상, 우수상, 최우수상 등)
3. 수상을 받았다면 구체적인 수상명을 찾아주세요
4. 수상을 받았다면 수상 이유와 배경을 설명해주세요
5. 수상을 받지 않았으면 "N"으로 응답하고 이유를 설명해주세요

반드시!!! 다음 JSON 형식으로 응답해주세요. 다른형식으로 응답하면 처리를 할수 없습니다.:
{{
    "award_analysis": {{
        "is_award_related": "Y" or "N",
        "award_name": "구체적인 수상명 (수상 관련이 아닌 경우 빈 문자열)",
        "award_reason": "수상을 받았다고 판단한 대한 이유 설명"
    }}
}}
"""
        
        # 수상실적 분석 (web_search_preview 사용)
        award_result = None
        try:
            award_result = self._call_chatgpt_with_web_search(award_prompt, current_news_num)
            if not award_result:
                raise Exception("수상실적 분석 결과가 없습니다")
        except Exception as e:
            print(f"[DEBUG] 뉴스 {current_news_num} 수상실적 분석 중 오류: {str(e)}")
            award_result = {
                "award_analysis": {
                    "is_award_related": "N",
                    "award_name": "",
                    "award_reason": f"수상실적 분석 중 오류 발생: {str(e)[:50]}"
                }
            }
        
        # 3. 투자실적 분석 (web_search_preview 사용)
        investment_prompt = f"""
{content}

기사 원본 링크의 내용을 분석해서 투자실적을 파악해주세요.

분석 요구사항:
1. 기사 원본 링크에 직접 접근하여 전체 기사 내용을 분석
2. 투자 관련 뉴스인지 판단 (투자유치, 투자, 펀딩, funding, 시리즈A/B/C, IPO, 투자성과, 투자결과 등)
3. 투자 관련이면 구체적인 투자명이나 투자 유형을 찾아주세요
4. 투자 관련이면 투자 금액, 투자자, 투자 목적 등을 상세히 설명해주세요
5. 투자 관련이 아니면 "N"으로 응답하고 이유를 설명해주세요

반드시!!! 다음 JSON 형식으로 응답해주세요. 다른형식으로 응답하면 처리를 할수 없습니다.:
{{
    "investment_analysis": {{
        "is_investment_related": "Y" or "N",
        "investment_name": "구체적인 투자명이나 투자 유형 (투자 관련이 아닌 경우 빈 문자열)",
        "investment_reason": "투자실적 여부에 대한 이유 설명"
    }}
}}
"""
        
        # 투자실적 분석 (web_search_preview 사용)
        investment_result = None
        try:
            investment_result = self._call_chatgpt_with_web_search(investment_prompt, current_news_num)
            if not investment_result:
                raise Exception("투자실적 분석 결과가 없습니다")
        except Exception as e:
            print(f"[DEBUG] 뉴스 {current_news_num} 투자실적 분석 중 오류: {str(e)}")
            investment_result = {
                "investment_analysis": {
                    "is_investment_related": "N",
                    "investment_name": "",
                    "investment_reason": f"투자실적 분석 중 오류 발생: {str(e)[:50]}"
                }
            }
        
        # 분석 결과를 뉴스 정보와 함께 저장
        return {
            "news_info": {
                "title": title,
                "description": content,
                "source": source,
                "published": published,
                "link": link
            },
            "trend_analysis": {
                "news_trend_summary": trend_result.get("trend_analysis", {}).get("news_trend_summary", "") if trend_result else "분석 중 오류가 발생했습니다.",
                "sentiment_score": trend_result.get("trend_analysis", {}).get("sentiment_score", 0) if trend_result else 0,
                "sentiment_label": trend_result.get("trend_analysis", {}).get("sentiment_label", "중립") if trend_result else "중립"
            },
            "award_analysis": {
                "is_award_related": award_result.get("award_analysis", {}).get("is_award_related", "N") if award_result else "N",
                "award_reason": award_result.get("award_analysis", {}).get("award_reason", "") if award_result else "분석 중 오류가 발생했습니다.",
                "award_name": award_result.get("award_analysis", {}).get("award_name", "") if award_result else ""
            },
            "investment_analysis": {
                "is_investment_related": investment_result.get("investment_analysis", {}).get("is_investment_related", "N") if investment_result else "N",
                "investment_reason": investment_result.get("investment_analysis", {}).get("investment_reason", "") if investment_result else "분석 중 오류가 발생했습니다.",
                "investment_name": investment_result.get("investment_analysis", {}).get("investment_name", "") if investment_result else ""
            }
        }

    def _call_chatgpt_with_web_search(self, prompt, current_news_num, max_retries=3):
        """web_search_preview를 사용한 ChatGPT 호출"""
        for attempt in range(max_retries):
            try:
                print(f"[DEBUG] 뉴스 {current_news_num} ChatGPT web_search_preview API 호출 시도 {attempt + 1}/{max_retries}")
                print(f"[DEBUG] 프롬프트 길이: {len(prompt)}자")
                
                response = self.client.responses.create(
                    model=self.model_name,
                    tools=[{"type": "web_search_preview"}],
                    input=prompt
                )
                
                content = response.output_text.strip()
                print(f"[DEBUG] 뉴스 {current_news_num} ChatGPT web_search_preview API 호출 성공")
                print(f"[DEBUG] 응답 길이: {len(content)}자")
                print(f"[DEBUG] 응답 내용 (처음 200자): {content[:200]}...")
                
                if content:
                    # 강화된 JSON 파싱 함수 사용
                    result = self._extract_and_parse_json(content, current_news_num)
                    if result:
                        return result
                else:
                    print(f"[DEBUG] 뉴스 {current_news_num} 응답이 비어있음")
                    if attempt == max_retries - 1:
                        return None
                    continue
                    
            except Exception as e:
                print(f"[DEBUG] 뉴스 {current_news_num} ChatGPT web_search_preview API 호출 시도 {attempt + 1} 실패: {e}")
                print(f"[DEBUG] 오류 타입: {type(e)}")
                import traceback
                print(f"[DEBUG] 오류 상세: {traceback.format_exc()}")
                if attempt == max_retries - 1:
                    return None
                import time
                time.sleep(2 ** attempt)  # 지수 백오프
        
        return None

    def _generate_comprehensive_opinion(self, company_name, analyzed_news):
        """정량적 분석 결과를 바탕으로 종합분석을 생성합니다."""
        try:
            total_news = len(analyzed_news)
            print(f"[DEBUG] 종합분석 시작 - 총 뉴스: {total_news}개")
            
            if total_news == 0:
                print("[DEBUG] 분석된 뉴스가 없음")
                return f"""종합분석

분석된 뉴스가 없어서 종합분석을 생성할 수 없습니다."""
            
            # 동향분석 통계 계산
            sentiment_scores = []
            positive_count = 0
            negative_count = 0
            neutral_count = 0
            
            # 수상실적 및 투자실적 카운트
            award_count = 0
            investment_count = 0
            
            # 데이터 검증 및 통계 계산
            for i, news in enumerate(analyzed_news):
                try:
                    if not isinstance(news, dict):
                        print(f"[DEBUG] 뉴스 {i+1}가 딕셔너리가 아님: {type(news)}")
                        continue
                    
                    trend_analysis = news.get("trend_analysis", {})
                    award_analysis = news.get("award_analysis", {})
                    investment_analysis = news.get("investment_analysis", {})
                    
                    # 감정점수 수집 (안전한 처리)
                    sentiment_score = trend_analysis.get("sentiment_score", 0)
                    
                    # 감정 점수 타입 검증 및 변환
                    if isinstance(sentiment_score, str):
                        try:
                            sentiment_score = float(sentiment_score)
                        except (ValueError, TypeError):
                            print(f"[DEBUG] 뉴스 {i+1} 감정 점수 변환 실패: {sentiment_score}")
                            sentiment_score = 0
                    elif not isinstance(sentiment_score, (int, float)):
                        print(f"[DEBUG] 뉴스 {i+1} 감정 점수 타입 오류: {type(sentiment_score)}")
                        sentiment_score = 0
                    
                    # 감정 점수 범위 검증
                    if -10 <= sentiment_score <= 10:
                        sentiment_scores.append(sentiment_score)
                        
                        if sentiment_score > 0:
                            positive_count += 1
                        elif sentiment_score < 0:
                            negative_count += 1
                        else:
                            neutral_count += 1
                    else:
                        print(f"[DEBUG] 뉴스 {i+1} 감정 점수 범위 오류: {sentiment_score}")
                        sentiment_scores.append(0)
                        neutral_count += 1
                    
                    # 수상실적 카운트 (안전한 처리)
                    is_award_related = award_analysis.get("is_award_related", "N")
                    if isinstance(is_award_related, str) and is_award_related.upper() == "Y":
                        award_count += 1
                    
                    # 투자실적 카운트 (안전한 처리)
                    is_investment_related = investment_analysis.get("is_investment_related", "N")
                    if isinstance(is_investment_related, str) and is_investment_related.upper() == "Y":
                        investment_count += 1
                        
                except Exception as e:
                    print(f"[DEBUG] 뉴스 {i+1} 통계 계산 중 오류: {str(e)}")
                    print(f"[DEBUG] 뉴스 {i+1} 데이터: {news}")
                    continue
            
            print(f"[DEBUG] 통계 계산 완료:")
            print(f"[DEBUG] - 감정 점수 수집: {len(sentiment_scores)}개")
            print(f"[DEBUG] - 긍정: {positive_count}, 부정: {negative_count}, 중립: {neutral_count}")
            print(f"[DEBUG] - 수상실적: {award_count}, 투자실적: {investment_count}")
            
            # 평균 감정점수 계산 (안전한 처리)
            try:
                if sentiment_scores:
                    avg_sentiment = sum(sentiment_scores) / len(sentiment_scores)
                    # 소수점 첫째 자리까지 반올림
                    avg_sentiment = round(avg_sentiment, 1)
                else:
                    avg_sentiment = 0.0
                print(f"[DEBUG] 평균 감정점수 계산 완료: {avg_sentiment}")
            except Exception as e:
                print(f"[DEBUG] 평균 감정점수 계산 중 오류: {str(e)}")
                avg_sentiment = 0.0
            
            # 종합분석 텍스트 생성 (안전한 처리)
            try:
                # 숫자 데이터 검증
                total_news_str = str(total_news) if total_news >= 0 else "0"
                avg_sentiment_str = f"{avg_sentiment:+.1f}" if isinstance(avg_sentiment, (int, float)) else "0.0"
                negative_count_str = str(negative_count) if negative_count >= 0 else "0"
                award_count_str = str(award_count) if award_count >= 0 else "0"
                investment_count_str = str(investment_count) if investment_count >= 0 else "0"
                
                comprehensive_opinion = f"""- 총 {total_news_str}건의 뉴스에서 동향분석, 수상실적 분석, 투자실적 분석을 하였습니다.
- 동향분석을 정량적으로 분석해본 결과 뉴스별로 평균 <span style="color: #4285f4; font-weight: bold;">{avg_sentiment_str}점의 긍정/부정 평가점수</span>를 받았습니다.
   ※ 특히 부정적인 평가는 {negative_count_str}건이 있었습니다.
- <span style="color: #4285f4; font-weight: bold;">수상실적은 {award_count_str}건</span>으로 추정됩니다.
- <span style="color: #4285f4; font-weight: bold;">투자실적은 {investment_count_str}건</span>으로 추정됩니다."""
                
                print(f"[DEBUG] 생성된 종합의견 원본: '{comprehensive_opinion}'")
                print(f"[DEBUG] 종합분석 완료 - 총 뉴스: {total_news}, 평균 감정점수: {avg_sentiment}, 부정: {negative_count}, 수상: {award_count}, 투자: {investment_count}")
                
                return comprehensive_opinion
                
            except Exception as e:
                print(f"[DEBUG] 종합분석 텍스트 생성 중 오류: {str(e)}")
                print(f"[DEBUG] 오류 상세: {type(e).__name__}")
                import traceback
                print(f"[DEBUG] 오류 스택: {traceback.format_exc()}")
                
                # 기본 종합분석 텍스트 반환
                return f"""종합분석

총 {total_news}건의 뉴스에서 동향분석, 수상실적 분석, 투자실적 분석을 하였습니다.

분석 중 오류가 발생하여 정확한 통계를 제공할 수 없습니다.

오류: {str(e)[:100]}"""
                
        except Exception as e:
            print(f"[DEBUG] 종합분석 생성 전체 오류: {str(e)}")
            print(f"[DEBUG] 오류 타입: {type(e).__name__}")
            import traceback
            print(f"[DEBUG] 오류 스택: {traceback.format_exc()}")
            
            return f"""종합분석

분석 중 오류가 발생하여 종합분석을 생성할 수 없습니다.

오류: {str(e)[:100]}"""

    def _extract_and_parse_json(self, content, current_news_num):
        """ChatGPT 응답에서 JSON 부분만 추출하고 파싱하는 강화된 함수"""
        import json
        import re
        import traceback
        
        print(f"[DEBUG] ===== 뉴스 {current_news_num} JSON 파싱 시작 =====")
        
        if not content:
            print(f"[ERROR] 뉴스 {current_news_num} 응답이 비어있음")
            return None
        
        print(f"[DEBUG] 원본 응답 길이: {len(content)}자")
        print(f"[DEBUG] 원본 응답 전체:\n{content}")
        print(f"[DEBUG] ===== 원본 응답 끝 =====")
        
        # 1. 먼저 일반적인 JSON 파싱 시도
        try:
            result = json.loads(content.strip())
            print(f"[DEBUG] 뉴스 {current_news_num} 직접 JSON 파싱 성공")
            print(f"[DEBUG] 파싱 결과: {result}")
            return result
        except json.JSONDecodeError as e:
            print(f"[ERROR] 뉴스 {current_news_num} 직접 JSON 파싱 실패")
            print(f"[ERROR] JSONDecodeError: {str(e)}")
            print(f"[ERROR] 오류 위치: line {e.lineno}, column {e.colno}")
            print(f"[DEBUG] JSON 블록 추출 시도")
        
        # 2. JSON 블록 추출 시도 (```json ... ``` 형태)
        json_block_pattern = r'```(?:json)?\s*(\{.*?\})\s*```'
        json_matches = re.findall(json_block_pattern, content, re.DOTALL | re.IGNORECASE)
        
        if json_matches:
            print(f"[DEBUG] 뉴스 {current_news_num} JSON 블록 {len(json_matches)}개 발견")
            for i, json_str in enumerate(json_matches):
                try:
                    print(f"[DEBUG] JSON 블록 {i+1} 내용: {json_str[:200]}...")
                    result = json.loads(json_str.strip())
                    print(f"[DEBUG] 뉴스 {current_news_num} JSON 블록 {i+1} 파싱 성공")
                    print(f"[DEBUG] 파싱 결과: {result}")
                    return result
                except json.JSONDecodeError as e:
                    print(f"[ERROR] 뉴스 {current_news_num} JSON 블록 {i+1} 파싱 실패: {e}")
        
        # 3. 중괄호로 둘러싸인 JSON 객체 추출
        brace_pattern = r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}'
        brace_matches = re.findall(brace_pattern, content, re.DOTALL)
        
        if brace_matches:
            print(f"[DEBUG] 뉴스 {current_news_num} 중괄호 패턴 {len(brace_matches)}개 발견")
            for i, json_str in enumerate(brace_matches):
                try:
                    result = json.loads(json_str.strip())
                    validated_result = self._validate_json_result(result, current_news_num)
                    if validated_result:
                        print(f"[DEBUG] 뉴스 {current_news_num} 중괄호 패턴 {i+1} 파싱 성공")
                        return validated_result
                except json.JSONDecodeError as e:
                    print(f"[DEBUG] 뉴스 {current_news_num} 중괄호 패턴 {i+1} 파싱 실패: {e}")
        
        # 4. 특정 키워드가 포함된 부분에서 JSON 추출
        keywords = ["trend_analysis", "award_analysis", "investment_analysis", "is_award_related", "is_investment_related"]
        for keyword in keywords:
            if keyword in content:
                # 키워드 주변 텍스트에서 JSON 추출 시도
                keyword_index = content.find(keyword)
                start_index = max(0, keyword_index - 50)
                end_index = min(len(content), keyword_index + 500)
                context = content[start_index:end_index]
                
                # 컨텍스트에서 JSON 추출
                brace_matches = re.findall(brace_pattern, context, re.DOTALL)
                for json_str in brace_matches:
                    try:
                        result = json.loads(json_str.strip())
                        validated_result = self._validate_json_result(result, current_news_num)
                        if validated_result and any(key in result for key in keywords):
                            print(f"[DEBUG] 뉴스 {current_news_num} 키워드 '{keyword}' 기반 JSON 추출 성공")
                            return validated_result
                    except json.JSONDecodeError:
                        continue
        
        # 5. 마지막 시도: 텍스트 정리 후 JSON 추출
        print(f"[DEBUG] 뉴스 {current_news_num} 텍스트 정리 후 재시도")
        cleaned_content = content
        
        # 불필요한 텍스트 제거
        lines = cleaned_content.split('\n')
        json_lines = []
        in_json = False
        
        for line in lines:
            line = line.strip()
            if line.startswith('{') or line.startswith('"') or line.startswith('['):
                in_json = True
            if in_json:
                json_lines.append(line)
            if line.endswith('}') or line.endswith(']'):
                in_json = False
        
        if json_lines:
            try:
                json_str = '\n'.join(json_lines)
                result = json.loads(json_str)
                validated_result = self._validate_json_result(result, current_news_num)
                if validated_result:
                    print(f"[DEBUG] 뉴스 {current_news_num} 텍스트 정리 후 JSON 파싱 성공")
                    return validated_result
            except json.JSONDecodeError:
                pass
        
        # 6. 모든 시도 실패
        print(f"[ERROR] ===== 뉴스 {current_news_num} 모든 JSON 추출 시도 실패 =====")
        print(f"[ERROR] ChatGPT가 JSON 형식으로 응답하지 않았습니다")
        print(f"[ERROR] 응답 전체 내용:\n{content}")
        print(f"[ERROR] ===== JSON 파싱 실패 끝 =====")
        return None

    def _validate_json_result(self, result, current_news_num):
        """JSON 결과 검증 및 기본값 설정"""
        if not isinstance(result, dict):
            print(f"[DEBUG] 뉴스 {current_news_num} JSON 결과가 딕셔너리가 아님")
            return None
        
        # 필수 키워드가 있는지 확인
        keywords = ["trend_analysis", "award_analysis", "investment_analysis"]
        if not any(keyword in result for keyword in keywords):
            print(f"[DEBUG] 뉴스 {current_news_num} JSON 결과에 필수 키워드 없음")
            return None
        
        return result

    def _create_default_json_result(self, error_message):
        """기본 JSON 결과 생성"""
        return {
            "trend_analysis": {
                "news_trend_summary": f"분석 중 오류가 발생했습니다: {error_message}",
                "sentiment_score": 0,
                "sentiment_label": "중립"
            },
            "award_analysis": {
                "is_award_related": "N",
                "award_reason": f"분석 중 오류가 발생했습니다: {error_message}",
                "award_name": ""
            },
            "investment_analysis": {
                "is_investment_related": "N",
                "investment_reason": f"분석 중 오류가 발생했습니다: {error_message}",
                "investment_name": ""
            }
        }