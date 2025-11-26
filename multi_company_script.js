// ==================== 다수 기업 검색 기능 ====================

// 다수 기업 검색 모달 관련 요소
const multiCompanySearchBtn = document.getElementById('multiCompanySearchBtn');
const multiCompanyModal = document.getElementById('multiCompanyModal');
const closeMultiCompanyModal = document.getElementById('closeMultiCompanyModal');
const closeMultiSearchBtn = document.getElementById('closeMultiSearchBtn');
const startMultiSearchBtn = document.getElementById('startMultiSearchBtn');
const companyListForMulti = document.getElementById('companyListForMulti');
const selectAllCompanies = document.getElementById('selectAllCompanies');
const multiStartDate = document.getElementById('multiStartDate');
const multiEndDate = document.getElementById('multiEndDate');

// 다수 기업 검색 모달 열기
if (multiCompanySearchBtn) {
    multiCompanySearchBtn.addEventListener('click', function() {
        showMultiCompanyModal();
    });
}

// 다수 기업 검색 모달 닫기
if (closeMultiCompanyModal) {
    closeMultiCompanyModal.addEventListener('click', function() {
        hideMultiCompanyModal();
    });
}

if (closeMultiSearchBtn) {
    closeMultiSearchBtn.addEventListener('click', function() {
        hideMultiCompanyModal();
    });
}

// 모달 외부 클릭 시 닫기
if (multiCompanyModal) {
    multiCompanyModal.addEventListener('click', function(e) {
        if (e.target === multiCompanyModal) {
            hideMultiCompanyModal();
        }
    });
}

// 다수 기업 검색 모달 표시
function showMultiCompanyModal() {
    console.log('[DEBUG] 다수 기업 검색 모달 열기');
    
    // 기업 리스트 로드
    loadCompanyListForMulti();
    
    // 종료일을 오늘로 설정
    const today = new Date().toISOString().split('T')[0];
    multiEndDate.value = today;
    
    // 모달 표시
    multiCompanyModal.classList.add('show');
}

// 다수 기업 검색 모달 숨기기
function hideMultiCompanyModal() {
    multiCompanyModal.classList.remove('show');
    
    // 진행 상태 초기화
    const progressSection = document.getElementById('multiProgressSection');
    if (progressSection) {
        progressSection.style.display = 'none';
    }
}

// 기업 리스트 로드
function loadCompanyListForMulti() {
    console.log('[DEBUG] 다수 기업 검색용 기업 리스트 로드');
    
    if (!companyListForMulti) {
        console.error('[ERROR] companyListForMulti 요소를 찾을 수 없습니다');
        return;
    }
    
    // 전역 companyList 사용 (기존 좌측 패널의 기업 목록)
    if (!window.companyList || companyList.length === 0) {
        companyListForMulti.innerHTML = '<p style="padding: 20px; text-align: center; color: #999;">기업 목록을 불러올 수 없습니다.</p>';
        return;
    }
    
    // 기업 리스트 HTML 생성
    const html = companyList.map((company, index) => {
        return `
            <div class="company-item">
                <input type="checkbox" id="company_${index}" value="${company}" checked>
                <label for="company_${index}">${company}</label>
            </div>
        `;
    }).join('');
    
    companyListForMulti.innerHTML = html;
    
    console.log(`[DEBUG] ${companyList.length}개 기업 로드 완료`);
}

// 전체 선택/해제
if (selectAllCompanies) {
    selectAllCompanies.addEventListener('change', function() {
        const checkboxes = companyListForMulti.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = selectAllCompanies.checked;
        });
    });
}

// 다수 기업 검색 기간 프리셋 버튼
document.querySelectorAll('.period-preset-btn[data-multi-days], .period-preset-btn[data-multi-preset]').forEach(btn => {
    btn.addEventListener('click', function() {
        const days = this.getAttribute('data-multi-days');
        const preset = this.getAttribute('data-multi-preset');
        
        const endDate = new Date();
        const endDateStr = endDate.toISOString().split('T')[0];
        multiEndDate.value = endDateStr;
        
        if (preset === 'all') {
            // 기본설정기간 (2023-01-01)
            multiStartDate.value = '2023-01-01';
        } else if (days) {
            // N일 전
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - parseInt(days));
            const startDateStr = startDate.toISOString().split('T')[0];
            multiStartDate.value = startDateStr;
        }
    });
});

// 다수 기업 검색 시작
if (startMultiSearchBtn) {
    startMultiSearchBtn.addEventListener('click', function() {
        startMultiCompanySearch();
    });
}

async function startMultiCompanySearch() {
    console.log('[DEBUG] 다수 기업 검색 시작');
    
    // 선택된 기업 가져오기
    const checkboxes = companyListForMulti.querySelectorAll('input[type="checkbox"]:checked');
    const selectedCompanies = Array.from(checkboxes).map(cb => cb.value);
    
    if (selectedCompanies.length === 0) {
        alert('검색할 기업을 최소 1개 이상 선택해주세요.');
        return;
    }
    
    // 기간 가져오기
    const startDate = multiStartDate.value;
    const endDate = multiEndDate.value;
    
    if (!startDate || !endDate) {
        alert('검색 기간을 설정해주세요.');
        return;
    }
    
    if (new Date(startDate) > new Date(endDate)) {
        alert('시작일이 종료일보다 늦을 수 없습니다.');
        return;
    }
    
    console.log(`[DEBUG] 선택된 기업: ${selectedCompanies.length}개`);
    console.log(`[DEBUG] 검색 기간: ${startDate} ~ ${endDate}`);
    
    // 버튼 비활성화
    startMultiSearchBtn.disabled = true;
    startMultiSearchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 검색 중...';
    
    // 진행 상태 표시
    const progressSection = document.getElementById('multiProgressSection');
    const progressBar = document.getElementById('multiProgressBar');
    const progressText = document.getElementById('multiProgressText');
    const progressDetails = document.getElementById('multiProgressDetails');
    
    progressSection.style.display = 'block';
    progressBar.style.width = '0%';
    progressText.textContent = `0 / ${selectedCompanies.length} 기업 완료`;
    progressDetails.innerHTML = '';
    
    try {
        // 백엔드 API 호출
        const response = await fetch('/api/multi-company-search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                companies: selectedCompanies,
                start_date: startDate,
                end_date: endDate
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // 스트리밍 응답 처리
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        function readStream() {
            return reader.read().then(({done, value}) => {
                if (done) {
                    console.log('[DEBUG] 스트림 종료');
                    return;
                }
                
                const chunk = decoder.decode(value);
                buffer += chunk;
                
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                
                lines.forEach(line => {
                    if (line.startsWith('data: ')) {
                        try {
                            const jsonString = line.slice(6).trim();
                            if (!jsonString) return;
                            
                            const data = JSON.parse(jsonString);
                            console.log('[DEBUG] 스트림 데이터:', data);
                            
                            if (data.type === 'progress') {
                                // 진행 상태 업데이트
                                const percent = (data.completed / data.total) * 100;
                                progressBar.style.width = `${percent}%`;
                                progressText.textContent = `${data.completed} / ${data.total} 기업 완료`;
                                
                                // 진행 상세 추가
                                const statusIcon = data.status === 'success' ? 'fa-check-circle' : 
                                                   data.status === 'error' ? 'fa-times-circle' : 
                                                   'fa-spinner fa-spin';
                                const statusClass = data.status === 'success' ? 'success' : 
                                                   data.status === 'error' ? 'error' : 
                                                   'processing';
                                
                                const progressItem = document.createElement('div');
                                progressItem.className = `progress-item ${statusClass}`;
                                progressItem.innerHTML = `
                                    <i class="fas ${statusIcon}"></i>
                                    <span>${data.company}: ${data.message}</span>
                                `;
                                progressDetails.appendChild(progressItem);
                                progressDetails.scrollTop = progressDetails.scrollHeight;
                                
                            } else if (data.type === 'complete') {
                                // 완료 - ZIP 파일 다운로드
                                console.log('[DEBUG] 모든 검색 완료, ZIP 다운로드:', data.zip_filename);
                                
                                // ZIP 파일 다운로드
                                const downloadLink = document.createElement('a');
                                downloadLink.href = `/api/download-multi-result/${data.zip_filename}`;
                                downloadLink.download = data.zip_filename;
                                document.body.appendChild(downloadLink);
                                downloadLink.click();
                                document.body.removeChild(downloadLink);
                                
                                // 완료 메시지
                                alert(`모든 기업 검색이 완료되었습니다!\n성공: ${data.success_count}개\n실패: ${data.error_count}개\n\nZIP 파일이 다운로드됩니다.`);
                                
                                // 모달 닫기
                                setTimeout(() => {
                                    hideMultiCompanyModal();
                                }, 1000);
                                
                            } else if (data.type === 'error') {
                                console.error('[ERROR] 다수 기업 검색 오류:', data.message);
                                alert(`오류가 발생했습니다: ${data.message}`);
                            }
                            
                        } catch (parseError) {
                            console.error('[ERROR] JSON 파싱 오류:', parseError);
                            console.error('[ERROR] 원본 라인:', line);
                        }
                    }
                });
                
                return readStream();
            });
        }
        
        await readStream();
        
    } catch (error) {
        console.error('[ERROR] 다수 기업 검색 실패:', error);
        alert(`다수 기업 검색 중 오류가 발생했습니다: ${error.message}`);
    } finally {
        // 버튼 상태 복원
        startMultiSearchBtn.disabled = false;
        startMultiSearchBtn.innerHTML = '<i class="fas fa-search"></i> 기사 조회 시작';
    }
}
