
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
