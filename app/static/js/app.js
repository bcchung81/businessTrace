// 전역 변수
let currentSearchQuery = '';
let currentAnalysisResult = null; // 현재 AI 분석 결과 저장
let currentEventSource = null; // 현재 EventSource 객체
let currentTimeout = null; // 현재 타임아웃 객체

// DOM 요소들
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const newsGrid = document.getElementById('newsGrid');
const loading = document.getElementById('loading');
const noResults = document.getElementById('noResults');
// 초기 메시지 제거됨

const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const analyzeModal = document.getElementById('analyzeModal');
const progressModal = document.getElementById('progressModal');

// 초기화
document.addEventListener('DOMContentLoaded', function() {
    // 테스트 함수를 전역에서 사용할 수 있도록 설정
    window.testDisplayAnalysis = testDisplayAnalysis;
    console.log('[DEBUG] 테스트 함수가 전역에 등록되었습니다. 콘솔에서 testDisplayAnalysis()를 호출하여 테스트할 수 있습니다.');
    
    initializeApp();
    setupEventListeners();
    // loadLatestNews(); // 자동 뉴스 로드 제거
});

function initializeApp() {
    // 저장된 설정 로드
    loadSettings();
    
    // 기업 데이터 로드
    loadCompanyData();
    
    // 알람 상태 확인
    // checkAlertStatus(); // 알람 기능 제거
    
    // 초기 상태 설정: 로딩 숨기고 빈 상태로 시작
    hideLoading();
    newsGrid.style.display = 'none';
    noResults.style.display = 'none';
    // 초기 메시지 제거됨
}

function setupEventListeners() {
    // 검색 버튼 클릭
    searchBtn.addEventListener('click', performSearch);
    
    // 페이지 언로드 시 리소스 정리
    window.addEventListener('beforeunload', cleanupResources);
    window.addEventListener('unload', cleanupResources);
    
    // 엔터 키 검색
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
    

    
    // 키워드 버튼 클릭
    document.querySelectorAll('.keyword-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const keyword = this.dataset.keyword;
            searchInput.value = keyword;
            // 키워드 클릭 시 자동 검색 실행
            performSearch();
        });
    });
    
    
    
    
    // 설정 버튼 클릭
    settingsBtn.addEventListener('click', showSettingsModal);
    
    // 이메일 발송 버튼 클릭
    const sendEmailBtn = document.getElementById('sendEmailBtn');
    if (sendEmailBtn) {
        sendEmailBtn.addEventListener('click', sendEmail);
    }
    
    // 엑셀 저장 버튼 클릭
    const exportExcelBtn = document.getElementById('exportExcelBtn');
    if (exportExcelBtn) {
        exportExcelBtn.addEventListener('click', exportToExcel);
    }
    

    
    // 모달 이벤트
    setupModalEvents();
}

function setupModalEvents() {

    
    // 모달 외부 클릭 시 닫기 (CSS pointer-events로 제어됨)
    // CSS에서 pointer-events: none을 통해 배경 클릭이 차단되므로 이 리스너는 더 이상 작동하지 않음
    window.addEventListener('click', function(e) {
        if (e.target === settingsModal) {
            hideSettingsModal();
        }
        if (e.target === analyzeModal) {
            hideAnalyzeModal();
        }
        if (e.target === progressModal) {
            hideProgressModal();
        }
    });
    
    // 설정 모달 버튼 이벤트
    const closeSettingsModal = document.getElementById('closeSettingsModal');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
    
    if (closeSettingsModal) {
        closeSettingsModal.addEventListener('click', hideSettingsModal);
    }
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', saveSettings);
    }
    if (cancelSettingsBtn) {
        cancelSettingsBtn.addEventListener('click', hideSettingsModal);
    }
    
    // 분석 모달 버튼 이벤트
    const closeAnalyzeModal = document.getElementById('closeAnalyzeModal');
    
    if (closeAnalyzeModal) {
        closeAnalyzeModal.addEventListener('click', hideAnalyzeModal);
    }
    
    // 검색 결과 없음 모달 버튼 이벤트
    const closeNoResultsModal = document.getElementById('closeNoResultsModal');
    
    if (closeNoResultsModal) {
        closeNoResultsModal.addEventListener('click', hideNoResultsModal);
    }
    
    // 뉴스 검색 결과 모달 버튼 이벤트
    const closeNewsResultsBtn = document.getElementById('closeNewsResultsBtn');
    const closeNewsResultsModal = document.getElementById('closeNewsResultsModal');
    
    if (closeNewsResultsBtn) {
        closeNewsResultsBtn.addEventListener('click', hideNewsResultsModal);
    }
    if (closeNewsResultsModal) {
        closeNewsResultsModal.addEventListener('click', hideNewsResultsModal);
    }
}

// 설정 모달 관련 함수들
function showSettingsModal() {
    settingsModal.classList.add('show');
    // 설정을 먼저 로드하고 이벤트 리스너를 설정
    loadSettings();
    initializeSettingsEventListeners();
    
    // 네이버 필터링 체크박스 상태를 명시적으로 설정
    const naverTitleFilter = document.getElementById('naverTitleFilter');
    if (naverTitleFilter) {
        const settings = getSettings();
        const filterEnabled = settings.naverTitleFilter !== undefined ? settings.naverTitleFilter : true;
        console.log('showSettingsModal - 네이버 필터링 최종 설정:', filterEnabled);
        naverTitleFilter.checked = filterEnabled;
    }
}

function hideSettingsModal() {
    settingsModal.classList.remove('show');
}

function initializeSettingsEventListeners() {
    // 기존 이벤트 리스너 제거 (중복 방지)
    const aiModelSelect = document.getElementById('aiModel');
    const temperatureSlider = document.getElementById('temperature');
    const duplicateThresholdSlider = document.getElementById('duplicateThreshold');
    const naverSearchEnabled = document.getElementById('naverSearchEnabled');
    const googleSearchEnabled = document.getElementById('googleSearchEnabled');
    
    // AI 모델 선택 이벤트
    if (aiModelSelect) {
        // 기존 리스너 제거
        aiModelSelect.removeEventListener('change', handleAiModelChange);
        aiModelSelect.addEventListener('change', handleAiModelChange);
    }
    
    // Temperature 슬라이더 이벤트
    if (temperatureSlider) {
        const temperatureValue = document.getElementById('temperatureValue');
        if (temperatureValue) {
            temperatureSlider.addEventListener('input', function() {
                temperatureValue.textContent = this.value;
            });
        }
        // 기존 리스너 제거
        temperatureSlider.removeEventListener('change', handleTemperatureChange);
        temperatureSlider.addEventListener('change', handleTemperatureChange);
    }
    
    // 중복도율 슬라이더 이벤트
    if (duplicateThresholdSlider) {
        const thresholdValue = document.getElementById('thresholdValue');
        if (thresholdValue) {
            // 기존 이벤트 리스너 제거 (중복 방지)
            duplicateThresholdSlider.removeEventListener('input', updateThresholdValue);
            duplicateThresholdSlider.addEventListener('input', updateThresholdValue);
        }
        // 기존 리스너 제거
        duplicateThresholdSlider.removeEventListener('change', handleThresholdChange);
        duplicateThresholdSlider.addEventListener('change', handleThresholdChange);
    }
    
    // 뉴스 검색 소스 설정 이벤트
    if (naverSearchEnabled) {
        // 기존 리스너 제거
        naverSearchEnabled.removeEventListener('change', handleNaverSearchChange);
        naverSearchEnabled.addEventListener('change', handleNaverSearchChange);
    }
    
    if (googleSearchEnabled) {
        // 기존 리스너 제거
        googleSearchEnabled.removeEventListener('change', handleGoogleSearchChange);
        googleSearchEnabled.addEventListener('change', handleGoogleSearchChange);
    }
    
    // 네이버 필터링 체크박스 이벤트
    const naverTitleFilter = document.getElementById('naverTitleFilter');
    if (naverTitleFilter) {
        // 기존 리스너 제거
        naverTitleFilter.removeEventListener('change', handleNaverTitleFilterChange);
        naverTitleFilter.addEventListener('change', handleNaverTitleFilterChange);
    }
}

// 이벤트 핸들러 함수들
function handleAiModelChange() {
    updateModelInfo();
    saveSettingsToLocalStorage();
    showSettingsChangeMessage('AI 모델이 ' + this.options[this.selectedIndex].text + '로 변경되었습니다.');
}

function handleTemperatureChange() {
    saveSettingsToLocalStorage();
    showSettingsChangeMessage('ChatGPT Temperature가 ' + this.value + '로 변경되었습니다.');
}

function handleThresholdChange() {
    currentDuplicateThreshold = parseInt(this.value);
    saveSettingsToLocalStorage();
    showSettingsChangeMessage('중복도율이 ' + this.value + '%로 변경되었습니다.');
}

function handleNaverSearchChange() {
    const status = this.checked ? '사용' : '사용 안함';
    saveSettingsToLocalStorage();
    showSettingsChangeMessage('네이버 뉴스 검색이 ' + status + '으로 변경되었습니다.');
}

function handleGoogleSearchChange() {
    const status = this.checked ? '사용' : '사용 안함';
    saveSettingsToLocalStorage();
    showSettingsChangeMessage('구글 뉴스 검색이 ' + status + '으로 변경되었습니다.');
}

function handleNaverTitleFilterChange() {
    const status = this.checked ? '활성화' : '비활성화';
    saveSettingsToLocalStorage();
    showSettingsChangeMessage('정확한 검색어 필터링이 ' + status + '되었습니다.');
}

function updateModelInfo() {
    const aiModelSelect = document.getElementById('aiModel');
    const priceValue = document.getElementById('priceValue');
    
    if (aiModelSelect && priceValue) {
        const selectedModel = aiModelSelect.value;
        let priceText = '';
        
        if (selectedModel === 'gpt-4o-mini') {
            priceText = '입력: $0.15, 출력: $0.60';
        } else if (selectedModel === 'gpt-4o') {
            priceText = '입력: $2.50, 출력: $10.00';
        }
        
        priceValue.textContent = priceText;
    }
}

async function sendEmail() {
    if (!currentAnalysisResult) {
        alert('발송할 분석 결과가 없습니다.');
        return;
    }
    
    // 사용자 확인
    if (!confirm('현재 로그인한 이메일 주소로 AI 분석 결과를 발송하시겠습니까?')) {
        return;
    }
    
    const sendEmailBtn = document.getElementById('sendEmailBtn');
    const originalText = sendEmailBtn.innerHTML;
    
    try {
        // 버튼 로딩 상태 설정
        sendEmailBtn.classList.add('loading');
        sendEmailBtn.innerHTML = '<span class="loading-text">이메일 발송 중...</span>';
        sendEmailBtn.disabled = true;
        
        // 이메일 발송 요청
        const response = await fetch('/api/send/email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                company_name: currentAnalysisResult.company_name,
                analyzed_news: currentAnalysisResult.analyzed_news,
                comprehensive_opinion: currentAnalysisResult.comprehensive_opinion
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showSettingsChangeMessage('이메일이 성공적으로 발송되었습니다.');
        } else {
            alert('이메일 발송에 실패했습니다: ' + (data.error || '알 수 없는 오류'));
        }
    } catch (error) {
        console.error('이메일 발송 오류:', error);
        alert('이메일 발송 중 오류가 발생했습니다: ' + error.message);
    } finally {
        // 버튼 상태 복원
        sendEmailBtn.classList.remove('loading');
        sendEmailBtn.innerHTML = originalText;
        sendEmailBtn.disabled = false;
    }
}

function exportToExcel() {
    console.log('[DEBUG] exportToExcel 호출됨');
    console.log('[DEBUG] currentAnalysisResult:', currentAnalysisResult);
    
    if (!currentAnalysisResult) {
        alert('저장할 분석 결과가 없습니다.');
        return;
    }
    
    // 데이터 유효성 검사
    if (!currentAnalysisResult.company_name || !currentAnalysisResult.analyzed_news) {
        alert('분석 결과 데이터가 불완전합니다.');
        return;
    }
    
    try {
        // 엑셀 저장 요청
        fetch('/api/export/excel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                company_name: currentAnalysisResult.company_name,
                analyzed_news: currentAnalysisResult.analyzed_news,
                comprehensive_opinion: currentAnalysisResult.comprehensive_opinion
            })
        })
        .then(response => {
            if (response.ok) {
                return response.blob();
            } else {
                throw new Error('엑셀 저장에 실패했습니다.');
            }
        })
        .then(blob => {
            // 파일 다운로드
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            // 사용자 이메일에서 아이디 부분 추출
            const userEmail = sessionStorage.getItem('user_email') || '';
            const userIdPart = userEmail.split('@')[0] || 'unknown';
            
            console.log('[DEBUG] 프론트엔드 - sessionStorage user_email:', userEmail);
            console.log('[DEBUG] 프론트엔드 - userIdPart:', userIdPart);
            
            // 현재 시간을 YYYYMMDD_HHMM 형식으로 변환
            const now = new Date();
            const timestamp = now.getFullYear().toString() + 
                            (now.getMonth() + 1).toString().padStart(2, '0') + 
                            now.getDate().toString().padStart(2, '0') + '_' +
                            now.getHours().toString().padStart(2, '0') + 
                            now.getMinutes().toString().padStart(2, '0');
            
            const filename = `${userIdPart}_${currentAnalysisResult.company_name}_AI분석결과_${timestamp}.xlsx`;
            console.log('[DEBUG] 프론트엔드 - 생성된 파일명:', filename);
            
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            // 성공 메시지 표시
            showSettingsChangeMessage('엑셀 파일이 성공적으로 저장되었습니다.');
        })
        .catch(error => {
            console.error('엑셀 저장 오류:', error);
            alert('엑셀 저장 중 오류가 발생했습니다: ' + error.message);
        });
    } catch (error) {
        console.error('엑셀 저장 오류:', error);
        alert('엑셀 저장 중 오류가 발생했습니다: ' + error.message);
    }
}

function updateThresholdValue() {
    const thresholdValue = document.getElementById('thresholdValue');
    if (thresholdValue) {
        thresholdValue.textContent = this.value + '%';
        currentDuplicateThreshold = parseInt(this.value);
    }
}

function saveSettingsToLocalStorage() {
    const duplicateThresholdElement = document.getElementById('duplicateThreshold');
    const duplicateThresholdValue = parseInt(duplicateThresholdElement.value);
    
    console.log('saveSettingsToLocalStorage - 슬라이더 값:', duplicateThresholdElement.value);
    console.log('saveSettingsToLocalStorage - 파싱된 값:', duplicateThresholdValue);
    
    const naverTitleFilterElement = document.getElementById('naverTitleFilter');
    const naverTitleFilterValue = naverTitleFilterElement ? naverTitleFilterElement.checked : true;
    
    console.log('saveSettingsToLocalStorage - 네이버 필터링 체크박스 값:', naverTitleFilterValue);
    
    const settings = {
        // AI 모델 설정
        aiModel: document.getElementById('aiModel').value,
        temperature: parseFloat(document.getElementById('temperature').value),
        // 중복도율 설정
        duplicateThreshold: duplicateThresholdValue,
        // 네이버 필터링 설정
        naverTitleFilter: naverTitleFilterValue,
        // 검색 소스 설정
        naverSearchEnabled: document.getElementById('naverSearchEnabled').checked,
        googleSearchEnabled: document.getElementById('googleSearchEnabled').checked
    };
    
    console.log('saveSettingsToLocalStorage - 저장할 설정:', settings);
    localStorage.setItem('newsSettings', JSON.stringify(settings));
    
    // 전역 변수 업데이트
    currentDuplicateThreshold = settings.duplicateThreshold;
    console.log('saveSettingsToLocalStorage - currentDuplicateThreshold 업데이트:', currentDuplicateThreshold);
}

function showSettingsChangeMessage(message) {
    // 기존 메시지 제거
    const existingMessage = document.querySelector('.settings-change-message');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    // 새 메시지 생성
    const messageElement = document.createElement('div');
    messageElement.className = 'settings-change-message';
    messageElement.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #28a745;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 10000;
        font-size: 14px;
        font-weight: 500;
        animation: slideInRight 0.3s ease;
    `;
    messageElement.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
            <i class="fas fa-check-circle"></i>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(messageElement);
    
    // 3초 후 자동 제거
    setTimeout(() => {
        if (messageElement.parentElement) {
            messageElement.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
                if (messageElement.parentElement) {
                    messageElement.remove();
                }
            }, 300);
        }
    }, 3000);
}

function loadSettings() {
    // 로컬 스토리지에서 설정 불러오기
    const settings = JSON.parse(localStorage.getItem('newsSettings') || '{}');
    console.log('loadSettings - 저장된 설정:', settings);
    
    // AI 모델 설정
    const aiModelSelect = document.getElementById('aiModel');
    if (aiModelSelect) {
        aiModelSelect.value = settings.aiModel || 'gpt-4o-mini';
        updateModelInfo();
    }
    
    // Temperature 설정
    const temperatureSlider = document.getElementById('temperature');
    const temperatureValue = document.getElementById('temperatureValue');
    if (temperatureSlider && temperatureValue) {
        const temperature = settings.temperature || 0.1;
        temperatureSlider.value = temperature;
        temperatureValue.textContent = temperature;
    }
    
    // 중복도율 설정
    const duplicateThresholdSlider = document.getElementById('duplicateThreshold');
    const thresholdValue = document.getElementById('thresholdValue');
    if (duplicateThresholdSlider && thresholdValue) {
        console.log('loadSettings - settings.duplicateThreshold:', settings.duplicateThreshold);
        console.log('loadSettings - settings.duplicateThreshold 타입:', typeof settings.duplicateThreshold);
        const threshold = settings.duplicateThreshold !== undefined ? settings.duplicateThreshold : 50;
        console.log('loadSettings - 최종 중복도율 설정:', threshold);
        duplicateThresholdSlider.value = threshold;
        thresholdValue.textContent = threshold + '%';
        currentDuplicateThreshold = threshold;
    }

    // 네이버 필터링 설정
    const naverTitleFilter = document.getElementById('naverTitleFilter');
    if (naverTitleFilter) {
        console.log('loadSettings - settings.naverTitleFilter:', settings.naverTitleFilter);
        console.log('loadSettings - settings.naverTitleFilter 타입:', typeof settings.naverTitleFilter);
        const filterEnabled = settings.naverTitleFilter !== undefined ? settings.naverTitleFilter : true;
        console.log('loadSettings - 최종 네이버 필터링 설정:', filterEnabled);
        naverTitleFilter.checked = filterEnabled;
    }
    
    // 검색 소스 설정
    document.getElementById('naverSearchEnabled').checked = settings.naverSearchEnabled !== false;
    document.getElementById('googleSearchEnabled').checked = settings.googleSearchEnabled !== false;
}

function saveSettings() {
    const settings = {
        // AI 모델 설정
        aiModel: document.getElementById('aiModel').value,
        temperature: parseFloat(document.getElementById('temperature').value),
        // 중복도율 설정
        duplicateThreshold: parseInt(document.getElementById('duplicateThreshold').value),
        // 네이버 필터링 설정
        naverTitleFilter: document.getElementById('naverTitleFilter').checked,
        // 검색 소스 설정
        naverSearchEnabled: document.getElementById('naverSearchEnabled').checked,
        googleSearchEnabled: document.getElementById('googleSearchEnabled').checked
    };
    
    console.log('saveSettings - 저장할 설정:', settings);
    localStorage.setItem('newsSettings', JSON.stringify(settings));
    
    // 전역 변수 업데이트
    currentDuplicateThreshold = settings.duplicateThreshold;
    
    hideSettingsModal();
}

function getSettings() {
    return JSON.parse(localStorage.getItem('newsSettings') || '{}');
}

function performSearch() {
    const query = searchInput.value.trim();
    if (!query) return;
    
    console.log('performSearch called with query:', query);
    console.log('currentPeriodSettings:', currentPeriodSettings);
    
    currentSearchQuery = query;
    
    // 검색 진행상태 모달 표시
    showSearchProgressModal(query);
    
    showLoading();
    
    // 초기 상태에서도 달력의 날짜를 기준으로 검색
    // 기간설정이 활성화되어 있으면 기간별 검색 사용
    if (currentPeriodSettings && currentPeriodSettings.isActive) {
        console.log('Using period search');
        performPeriodSearch();
        return;
    }
    
    console.log('Using regular search with calendar dates');
    
    // 설정 불러오기
    const settings = getSettings();
    
    // 검색 조건에 따른 URL 생성 (달력의 날짜 포함)
    const params = new URLSearchParams({
        q: query,
        // 검색 소스 설정
        naver: settings.naverSearchEnabled !== false,
        google: settings.googleSearchEnabled !== false,
        // 중복도율 설정
        duplicate_threshold: currentDuplicateThreshold,
        // 네이버 필터링 설정
        naver_title_filter: settings.naverTitleFilter !== false
    });
    
    // 시작일과 종료일이 설정되어 있으면 날짜 파라미터 추가
    if (currentPeriodSettings && currentPeriodSettings.startDate && currentPeriodSettings.endDate) {
        params.append('start_date', currentPeriodSettings.startDate);
        params.append('end_date', currentPeriodSettings.endDate);
    }
    
    console.log('Regular search with calendar dates URL params:', params.toString());
    
    // 시뮬레이션 없이 기본 검색 상태만 표시
    
    // 시작일과 종료일이 설정되어 있으면 기간 검색 API 사용
    const apiUrl = (currentPeriodSettings && currentPeriodSettings.startDate && currentPeriodSettings.endDate) 
        ? `/api/search/period?${params}` 
        : `/api/search?${params}`;
    
    fetch(apiUrl, {
        headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        }
    })
        .then(response => response.json())
        .then(data => {
            console.log('Regular search response:', data);
            hideLoading();
            
            // 최종 결과 통계 계산
            const finalStats = {
                foundNewsCount: data.total_before_dedup || data.results.length,
                duplicatesRemoved: data.duplicates_removed || 0,
                finalNewsCount: data.total_after_dedup || data.results.length
            };
            
            // 1단계: 찾은 뉴스 개수 표시
            updateSearchProgress('processing', `${query}에 대해 찾은 뉴스의 중복을 제거하고 있습니다.`, 70, {
                foundNewsCount: finalStats.foundNewsCount
            });
            
            // 2단계: 중복 제거 완료 후 최종 결과 표시
            setTimeout(() => {
                completeSearchProgress(finalStats);
                
                // 3단계: 진행 팝업이 완전히 끝난 후 결과 팝업 표시
                setTimeout(() => {
            if (data.results && data.results.length > 0) {
                // 뉴스 그리드 숨기기
                newsGrid.style.display = 'none';
                noResults.style.display = 'none';
                showNewsResultsModal(data);
            } else {
                showNoResults(data);
                        hideSearchResultsInfo(0, true, currentPeriodSettings.startDate, currentPeriodSettings.endDate);
            }
                }, 2200); // 완료 메시지 표시 + 모달 닫기 시간 후
            }, 1200);
        })
        .catch(error => {
            console.error('Search error:', error);
            hideLoading();
            showNoResults();
            hideSearchResultsInfo(0, true, currentPeriodSettings.startDate, currentPeriodSettings.endDate); // 검색 결과 개수 숨기기
            
            // 에러 시 진행상태 모달 닫기
            hideSearchProgressModal();
        });
}

function loadLatestNews() {
    showLoading();
    fetch('/api/news', {
        headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        }
    })
        .then(response => response.json())
        .then(data => {
            hideLoading();
            if (data && data.length > 0) {
                displayNews(data);
                showSearchResultsInfo(data.length, false, null, null); // 검색 결과 개수 표시
            } else {
                showNoResults();
                hideSearchResultsInfo(0, false, null, null); // 검색 결과 개수 숨기기
            }
        })
        .catch(error => {
            console.error('Error loading latest news:', error);
            hideLoading();
            showNoResults();
            hideSearchResultsInfo(0, false, null, null); // 검색 결과 개수 숨기기
        });
}

function displayNews(newsItems) {
    newsGrid.innerHTML = '';
    noResults.style.display = 'none';
    // 초기 메시지 제거됨
    
    newsItems.forEach(news => {
        const newsCard = createNewsCard(news);
        newsGrid.appendChild(newsCard);
    });
}

function createNewsCard(news) {
    const card = document.createElement('div');
    card.className = 'news-card';
    
    const title = news.title || '제목 없음';
    const description = news.description || '설명 없음';
    const source = news.source || '알 수 없음';
    const published = formatDate(news.published);
    const link = news.link || '#';
    
    // 출처 첫 글자 추출 및 카테고리 클래스 결정
    const categoryName = getCategoryName(news);
    const categoryClass = getCategoryClass(news);
    
    card.innerHTML = `
        <div class="news-header">
            <span class="${categoryClass}">${categoryName}</span>
            <span class="news-source">${source}</span>
        </div>
        <div class="news-title">${title}</div>
        <div class="news-description">${description}</div>
        <div class="news-meta">
            <span class="news-date">${published}</span>
        </div>
    `;
    
    card.addEventListener('click', () => {
        if (link && link !== '#') {
            window.open(link, '_blank');
        }
    });
    
    return card;
}

function getCategoryName(news) {
    // search_source 필드를 기반으로 간단한 라벨 반환
    if (news.search_source === '네이버뉴스검색') {
        return 'N';
    } else if (news.search_source === '구글뉴스검색') {
        return 'G';
    } else if (news.search_source && news.search_source.startsWith('RSS(')) {
        // RSS(소스명) 형태에서 소스명 추출
        const match = news.search_source.match(/RSS\((.+)\)/);
        if (match) {
            const sourceName = match[1];
            
            // 특정 소스에 대한 명시적 매핑
            if (sourceName.includes('매일경제')) {
                return '매';
            } else if (sourceName.includes('전자신문')) {
                return '전';
            } else if (sourceName.includes('보안뉴스')) {
                return '보';
            } else if (sourceName.includes('연합뉴스')) {
                return '연';
            } else if (sourceName.includes('조선일보')) {
                return '조';
            } else if (sourceName.includes('중앙일보')) {
                return '중';
            } else if (sourceName.includes('동아일보')) {
                return '동';
            } else if (sourceName.includes('한겨레')) {
                return '한';
            } else if (sourceName.includes('코리아헤럴드')) {
                return '헤';
            } else if (sourceName.includes('코리아타임스')) {
                return '타';
            }
            
            // 기본 로직: 소스명을 줄여서 표시 (너무 길면 첫 글자만)
            if (sourceName.length > 6) {
                return sourceName.charAt(0);
            } else {
                return sourceName;
            }
        }
        return 'RSS';
    }
    return '뉴스';
}

function getCategoryClass(news) {
    // 카테고리에 따른 CSS 클래스 결정
    let categoryClass = 'news-category';
    if (news.search_source === '네이버뉴스검색') {
        categoryClass += ' naver';
    } else if (news.search_source === '구글뉴스검색') {
        categoryClass += ' google';
    } else if (news.search_source && news.search_source.startsWith('RSS(')) {
        // RSS 소스에 따른 세부 구분
        if (news.search_source.includes('전자신문')) {
            categoryClass += ' rss-etnews';
        } else if (news.search_source.includes('매일경제')) {
            categoryClass += ' rss-mk';
        } else if (news.search_source.includes('보안뉴스')) {
            categoryClass += ' rss-boan';
        } else if (news.search_source.includes('연합뉴스')) {
            categoryClass += ' rss-yonhap';
        } else if (news.search_source.includes('조선일보')) {
            categoryClass += ' rss-chosun';
        } else if (news.search_source.includes('중앙일보')) {
            categoryClass += ' rss-joongang';
        } else if (news.search_source.includes('동아일보')) {
            categoryClass += ' rss-donga';
        } else if (news.search_source.includes('한겨레')) {
            categoryClass += ' rss-hankyoreh';
        } else if (news.search_source.includes('코리아헤럴드')) {
            categoryClass += ' rss-koreaherald';
        } else if (news.search_source.includes('코리아타임스')) {
            categoryClass += ' rss-koreatimes';
        } else {
            categoryClass += ' rss';
        }
    }
    return categoryClass;
}

function formatDate(dateString) {
    if (!dateString) return '날짜 없음';
    
    try {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffMins < 1) return '방금 전';
        if (diffMins < 60) return `${diffMins}분 전`;
        if (diffHours < 24) return `${diffHours}시간 전`;
        if (diffDays < 7) return `${diffDays}일 전`;
        
        return date.toLocaleDateString('ko-KR');
    } catch (error) {
        return '날짜 오류';
    }
}

function showLoading() {
    loading.style.display = 'block';
    newsGrid.style.display = 'none';
    noResults.style.display = 'none';
    // 초기 메시지 제거됨
}

function hideLoading() {
    loading.style.display = 'none';
    // 검색 완료 후 뉴스 그리드는 숨기고 AI 분석 결과만 표시
    newsGrid.style.display = 'none';
    noResults.style.display = 'none';
}

function showNoResults(data = null) {
    loading.style.display = 'none';
    newsGrid.style.display = 'none';
    noResults.style.display = 'none'; // 기존 결과 없음 메시지 숨김
    
    // 검색 결과 없음 모달 표시 (데이터 포함)
    showNoResultsModal(data);
}

function showNoResultsModal(data = null) {
    const modal = document.getElementById('noResultsModal');
    const querySpan = document.getElementById('noResultsQuery');
    
    // 검색어 설정
    querySpan.textContent = currentSearchQuery;
    
    // 필터링 정보가 있는 경우 메시지 수정
    if (data && data.total_before_dedup !== undefined) {
        const totalBefore = data.total_before_dedup || 0;
        const periodFiltered = data.period_filtered || 0;
        const duplicatesRemoved = data.duplicates_removed || 0;
        
                    // 메시지를 더 상세하게 표시
            const messageElement = modal.querySelector('.no-results-message');
            if (messageElement) {
                let filterDetails = '';
                
                if (periodFiltered > 0 && duplicatesRemoved > 0) {
                    // 기간 필터링과 중복도 필터링 모두 있는 경우
                    filterDetails = `${currentSearchQuery}에 대한 뉴스를 총 ${totalBefore}개 찾았으나, 기간 필터링으로 ${periodFiltered}개, 중복도 필터링으로 ${duplicatesRemoved}개가 제거되어 결과가 없습니다.`;
                } else if (periodFiltered > 0) {
                    // 기간 필터링만 있는 경우
                    filterDetails = `${currentSearchQuery}에 대한 뉴스를 총 ${totalBefore}개 찾았으나, 기간 필터링으로 ${periodFiltered}개가 제거되어 결과가 없습니다.`;
                } else if (duplicatesRemoved > 0) {
                    // 중복도 필터링만 있는 경우
                    filterDetails = `${currentSearchQuery}에 대한 뉴스를 총 ${totalBefore}개 찾았으나, 중복도 필터링으로 ${duplicatesRemoved}개가 제거되어 결과가 없습니다.`;
                } else {
                    // 필터링 정보는 있지만 제거된 것이 없는 경우
                    filterDetails = `${currentSearchQuery}에 대한 뉴스를 총 ${totalBefore}개 찾았으나 결과가 없습니다.`;
                }
                
                messageElement.innerHTML = `
                    "<span>${currentSearchQuery}</span>"에 대한 뉴스를 찾을 수 없습니다.<br>
                    <small style="color: #666; margin-top: 10px; display: block;">
                        ${filterDetails}
                    </small>
                `;
            }
    } else {
        // 기본 메시지
        const messageElement = modal.querySelector('.no-results-message');
        if (messageElement) {
            messageElement.innerHTML = `"<span>${currentSearchQuery}</span>"에 대한 뉴스를 찾을 수 없습니다.`;
        }
    }
    
    // 모달 표시
    modal.style.display = 'flex';
    modal.classList.add('show');
}

function hideNoResultsModal() {
    const modal = document.getElementById('noResultsModal');
    modal.style.display = 'none';
    modal.classList.remove('show');
}

// 뉴스 검색 결과 모달 표시
function showNewsResultsModal(data) {
    const modal = document.getElementById('newsResultsModal');
    
    // 모달을 표시하기 전에 완전히 초기화
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.remove('show');
        
        // 기존 이벤트 리스너 제거
        const startAnalysisBtn = document.getElementById('startAnalysisBtn');
        const closeNewsResultsBtn = document.getElementById('closeNewsResultsBtn');
        const closeNewsResultsModal = document.getElementById('closeNewsResultsModal');
        
        if (startAnalysisBtn) {
            startAnalysisBtn.onclick = null;
        }
        if (closeNewsResultsBtn) {
            closeNewsResultsBtn.onclick = null;
        }
        if (closeNewsResultsModal) {
            closeNewsResultsModal.onclick = null;
        }
    }
    const searchCompanyName = document.getElementById('searchCompanyName');
    const totalNewsCount = document.getElementById('totalNewsCount');
    const duplicatesRemoved = document.getElementById('duplicatesRemoved');
    const uniqueNewsCount = document.getElementById('uniqueNewsCount');
    const googleNewsCount = document.getElementById('googleNewsCount');
    const naverNewsCount = document.getElementById('naverNewsCount');
    const newsList = document.getElementById('newsList');
    
    // 검색 회사명 설정
    const currentQuery = searchInput.value.trim();
    searchCompanyName.textContent = currentQuery || '기업';
    
    // 중복 제거 전후 정보 설정
    console.log('받은 데이터:', data);
    console.log('data.total_before_dedup:', data.total_before_dedup);
    console.log('data.total_after_dedup:', data.total_after_dedup);
    console.log('data.results.length:', data.results.length);
    
    if (data.total_before_dedup !== undefined) {
        // 새로운 형식: 중복 제거 정보가 포함된 경우
        console.log('새로운 형식 데이터:', {
            total_before_dedup: data.total_before_dedup,
            duplicates_removed: data.duplicates_removed,
            total_after_dedup: data.total_after_dedup,
            period_filtered: data.period_filtered
        });
        
        totalNewsCount.textContent = data.total_before_dedup || '0';
        
        // 기간 필터링과 중복 제거를 분리해서 표시
        const periodFiltered = data.period_filtered || 0;
        const duplicatesRemovedCount = data.duplicates_removed || 0;
        
        if (periodFiltered > 0) {
            // 기간 필터링이 있는 경우
            duplicatesRemoved.textContent = `${periodFiltered}개 (기간 필터링) + ${duplicatesRemovedCount}개 (중복도율 필터링)`;
            console.log(`필터링 정보: 총 ${data.total_before_dedup}개 → 기간 필터링 ${periodFiltered}개 제거 → 중복도율 필터링 ${duplicatesRemovedCount}개 → 최종 ${data.total_after_dedup}개`);
        } else {
            // 기간 필터링이 없는 경우
            duplicatesRemoved.textContent = duplicatesRemovedCount.toString();
            console.log(`중복도율 필터링 정보: 총 ${data.total_before_dedup}개 → 중복도율 필터링 ${duplicatesRemovedCount}개 → 최종 ${data.total_after_dedup}개`);
        }
        
        uniqueNewsCount.textContent = data.total_after_dedup || '0';
        console.log(`실제 results 배열 길이: ${data.results.length}`);
        
        // 데이터 불일치 체크
        if (data.total_after_dedup !== data.results.length) {
            console.warn(`⚠️ 데이터 불일치: total_after_dedup(${data.total_after_dedup}) !== results.length(${data.results.length})`);
        }
    } else {
        // 기존 형식: 하위 호환성
        console.log('기존 형식 데이터 사용');
        const totalCount = data.count || data.results.length;
        totalNewsCount.textContent = totalCount;
        duplicatesRemoved.textContent = '0';
        uniqueNewsCount.textContent = data.results.length;
    }
    
    // 소스별 뉴스 개수 계산
    let googleCount = 0;
    let naverCount = 0;
    
    // 모든 소스 정보를 수집하여 디버깅
    const allSources = new Set();
    data.results.forEach(news => {
        allSources.add(news.source || '');
    });
    console.log('All unique sources found:', Array.from(allSources));
    
    data.results.forEach(news => {
        const source = news.source || '';
        const searchSource = news.search_source || '';
        const sourceLower = source.toLowerCase();
        const searchSourceLower = searchSource.toLowerCase();
        
        // 디버깅을 위한 로그
        console.log('Processing news source:', source, 'search_source:', searchSource);
        
        // 구글 뉴스와 네이버 뉴스 구분
        if (searchSourceLower.includes('구글뉴스검색')) {
            googleCount++;
            console.log('Classified as Google News');
        } else if (searchSourceLower.includes('네이버뉴스검색')) {
            naverCount++;
            console.log('Classified as Naver News');
        }
    });
    
    // 총합 계산 및 검증
    const totalCalculated = googleCount + naverCount;
    
    console.log('Total calculated:', totalCalculated, 'vs Actual total:', data.results.length);
    console.log('Unclassified count:', data.results.length - totalCalculated);
    
    googleNewsCount.textContent = googleCount;
    naverNewsCount.textContent = naverCount;
    
    // 뉴스 목록 생성
    newsList.innerHTML = '';
    data.results.forEach((news, index) => {
        const newsItem = document.createElement('div');
        newsItem.className = 'news-list-item';
        newsItem.dataset.index = index;
        
        // 검색 출처의 첫 글자 추출
        const searchSource = news.search_source || '';
        let sourcePrefix = '';
        let prefixClass = '';
        
        if (searchSource.includes('구글뉴스검색')) {
            sourcePrefix = 'G';
            prefixClass = 'google';
        } else if (searchSource.includes('네이버뉴스검색')) {
            sourcePrefix = 'N';
            prefixClass = 'naver';
        }
        
        newsItem.innerHTML = `
            <div class="news-item-checkbox">
                <input type="checkbox" class="news-checkbox" data-index="${index}" checked>
            </div>
            <div class="news-item-content">
                <div class="news-title">
                    <span class="source-prefix ${prefixClass}">${sourcePrefix}</span>
                    ${news.title}
                </div>
                <div class="news-meta-inline">
                    <span class="news-source">${news.source}</span>
                    <span class="news-date">${formatDate(news.published)}</span>
                </div>
            </div>
        `;
        
        // 뉴스 제목 클릭 시 기사 링크로 이동
        const newsTitle = newsItem.querySelector('.news-title');
        newsTitle.style.cursor = 'pointer';
        newsTitle.addEventListener('click', () => {
            if (news.link && news.link !== '#') {
                window.open(news.link, '_blank');
            }
        });
        
        // 체크박스 이벤트 리스너
        const checkbox = newsItem.querySelector('.news-checkbox');
        checkbox.addEventListener('change', updateSelectedCount);
        
        newsList.appendChild(newsItem);
    });
    
    // 초기 선택 카운트 업데이트
    updateSelectedCount();
    
    // 전체 선택/해제 체크박스 이벤트 리스너
    const selectAllCheckbox = document.getElementById('selectAllNews');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', function() {
            const newsCheckboxes = document.querySelectorAll('.news-checkbox');
            newsCheckboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
            });
            updateSelectedCount();
        });
    }
    
    // 모달 표시
    modal.classList.add('show');
    
    // 엑셀 다운로드 버튼에 이벤트 리스너 추가
    const excelDownloadBtn = document.getElementById('excelDownloadBtn');
    if (excelDownloadBtn) {
        excelDownloadBtn.onclick = () => {
            console.log('[DEBUG] 엑셀 다운로드 버튼 클릭됨');
            const selectedNews = getSelectedNews(data);
            if (selectedNews.length === 0) {
                alert('다운로드할 뉴스를 선택해주세요.');
                return;
            }
            downloadExcel(selectedNews);
        };
    } else {
        console.error('[ERROR] excelDownloadBtn 요소를 찾을 수 없습니다');
    }
    
    // AI 분석 버튼에 이벤트 리스너 추가
    const startAnalysisBtn = document.getElementById('startAnalysisBtn');
    if (startAnalysisBtn) {
    startAnalysisBtn.onclick = () => {
            console.log('[DEBUG] AI 분석 버튼 클릭됨');
            const selectedNewsData = getSelectedNewsData(data);
            if (selectedNewsData.length === 0) {
                alert('분석할 뉴스를 선택해주세요.');
                return;
            }
            
            // AI 분석 비용 확인 팝업
            const confirmed = confirm('AI 분석은 비용이 발생합니다.\n분석을 시작할까요?');
            if (!confirmed) {
                console.log('[DEBUG] AI 분석이 취소되었습니다.');
                return;
            }
            
            console.log('[DEBUG] 선택된 뉴스 데이터:', selectedNewsData.length, '건');
            // 검색 결과 모달을 완전히 닫기
            hideNewsResultsModal();
            // 선택된 뉴스를 직접 분석
            analyzeSearchedNews(selectedNewsData);
    };
    } else {
        console.error('[ERROR] startAnalysisBtn 요소를 찾을 수 없습니다');
    }
    
    // 닫기 버튼 이벤트 리스너
    const closeNewsResultsBtn = document.getElementById('closeNewsResultsBtn');
    const closeNewsResultsModal = document.getElementById('closeNewsResultsModal');
    
    closeNewsResultsBtn.onclick = () => hideNewsResultsModal();
    closeNewsResultsModal.onclick = () => hideNewsResultsModal();
    
    // 모달 외부 클릭으로 닫기 기능 제거됨 - 닫기 버튼으로만 닫기 가능
}

// 선택된 뉴스 개수 업데이트
function updateSelectedCount() {
    const checkedBoxes = document.querySelectorAll('.news-checkbox:checked');
    const selectedCountElement = document.getElementById('selectedNewsCount');
    if (selectedCountElement) {
        selectedCountElement.textContent = checkedBoxes.length;
    }
    
    // 전체 선택 체크박스 상태 업데이트
    const selectAllCheckbox = document.getElementById('selectAllNews');
    const allCheckboxes = document.querySelectorAll('.news-checkbox');
    if (selectAllCheckbox && allCheckboxes.length > 0) {
        selectAllCheckbox.checked = checkedBoxes.length === allCheckboxes.length;
    }
}

// 선택된 뉴스 데이터 가져오기 (AI 분석용)
function getSelectedNewsData(searchData) {
    const checkedBoxes = document.querySelectorAll('.news-checkbox:checked');
    const selectedIndices = Array.from(checkedBoxes).map(cb => parseInt(cb.dataset.index));
    return searchData.results.filter((_, index) => selectedIndices.includes(index));
}

// 선택된 뉴스로 검색 데이터 객체 생성 (엑셀 다운로드용)
function getSelectedNews(searchData) {
    const checkedBoxes = document.querySelectorAll('.news-checkbox:checked');
    const selectedIndices = Array.from(checkedBoxes).map(cb => parseInt(cb.dataset.index));
    const selectedResults = searchData.results.filter((_, index) => selectedIndices.includes(index));
    
    return {
        results: selectedResults,
        total_before_dedup: searchData.total_before_dedup,
        total_after_dedup: selectedResults.length,
        duplicates_removed: searchData.duplicates_removed
    };
}



// 자동 갱신 관련 전역 변수와 함수들 제거
// function startAutoRefresh() {
//     if (refreshInterval) {
//         clearInterval(refreshInterval);
//     }
    
//     // 5분마다 자동 새로고침
//     refreshInterval = setInterval(() => {
//         if (currentSearchQuery) {
//             performSearch();
//         }
//     }, 5 * 60 * 1000);
// }

// function checkAlertStatus() { // 알람 기능 제거
//     fetch('/api/alert/status')
//         .then(response => response.json())
//         .then(data => {
//             isAlertEnabled = data.enabled;
//             updateAlertButton();
            
//             if (isAlertEnabled) {
//                 startAlertCheck();
//             }
//         })
//         .catch(error => {
//             console.error('Error checking alert status:', error);
//         });
// }

// function toggleNewsAlert() { // 알람 기능 제거
//     fetch('/api/alert/toggle', {
//         method: 'POST',
//         headers: {
//             'Content-Type': 'application/json'
//         }
//     })
//         .then(response => response.json())
//         .then(data => {
//             isAlertEnabled = data.enabled;
//             updateAlertButton();
            
//             if (isAlertEnabled) {
//                 startAlertCheck();
//                 showAlertKeywordModal();
//             } else {
//                 stopAlertCheck();
//             }
//         })
//         .catch(error => {
//             console.error('Error toggling alert:', error);
//         });
// }

// function updateAlertButton() { // 알람 기능 제거
//     const icon = newsAlertBtn.querySelector('i');
//     if (isAlertEnabled) {
//         newsAlertBtn.classList.add('active');
//         icon.className = 'fas fa-bell';
//     } else {
//         newsAlertBtn.classList.remove('active');
//         icon.className = 'fas fa-bell-slash';
//     }
// }

// function startAlertCheck() { // 알람 기능 제거
//     if (alertCheckInterval) {
//         clearInterval(alertCheckInterval);
//     }
    
//     // 1분마다 알람 체크
//     alertCheckInterval = setInterval(() => {
//         checkAllAlerts();
//     }, 60 * 1000);
// }

// function stopAlertCheck() { // 알람 기능 제거
//     if (alertCheckInterval) {
//         clearInterval(alertCheckInterval);
//         alertCheckInterval = null;
//     }
// }

// function checkAllAlerts() { // 알람 기능 제거
//     fetch('/api/alert/check-all')
//         .then(response => response.json())
//         .then(data => {
//             if (data.enabled && data.total_new_count > 0) {
//                 showAlertNotification(data);
//             }
//         })
//         .catch(error => {
//             console.error('Error checking alerts:', error);
//         });
// }

// function showAlertNotification(data) { // 알람 기능 제거
//     const notification = new Notification('새로운 뉴스 알림', {
//         body: `${data.total_new_count}개의 새로운 뉴스가 있습니다.`,
//         icon: '/favicon.ico'
//     });
    
//     notification.onclick = function() {
//         window.focus();
//         this.close();
//     };
// }





// 기간 설정 관련 전역 변수
let currentPeriodSettings = {
    startDate: '2024-01-01',
    endDate: new Date().toISOString().split('T')[0],
    isActive: false
};

// 기간 설정 초기화
function initializePeriodSettings() {
    // 시작일과 종료일을 달력에 설정
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    
    if (startDateInput) {
        startDateInput.value = currentPeriodSettings.startDate;
    }
    if (endDateInput) {
        endDateInput.value = currentPeriodSettings.endDate;
    }
    
    // 기간 설정 영역 (토글 기능 제거 - 항상 표시)
    const periodContent = document.getElementById('periodContent');
    
    // 기간 프리셋 버튼들
    document.querySelectorAll('.period-preset-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const days = this.dataset.days;
            const preset = this.dataset.preset;
            
            if (preset === 'all') {
                // 기본설정기간: 2024년 1월 1일부터 현재까지
                document.getElementById('startDate').value = '2024-01-01';
                document.getElementById('endDate').value = new Date().toISOString().split('T')[0];
                // 기본설정기간도 날짜 필터 적용
                currentPeriodSettings.isActive = true;
            } else if (days) {
                // 최근 N일
                const endDate = new Date();
                const startDate = new Date();
                startDate.setDate(endDate.getDate() - parseInt(days));
                
                document.getElementById('startDate').value = startDate.toISOString().split('T')[0];
                document.getElementById('endDate').value = endDate.toISOString().split('T')[0];
                // 특정 기간일 때는 isActive를 true로 설정
                currentPeriodSettings.isActive = true;
            }
            
            // 활성 상태 표시
            document.querySelectorAll('.period-preset-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            // 날짜만 변경하고 자동 검색은 하지 않음
            if (preset === 'all') {
                // 기본설정기간일 때도 설정 업데이트
                updatePeriodSettings();
            } else {
                updatePeriodSettings();
            }
        });
    });
    
    // 기간 초기화 버튼 제거됨
    
    // 시작일과 종료일 입력 시 자동 적용
    if (startDateInput) {
        startDateInput.addEventListener('change', autoApplyPeriodSettings);
    }
    
    if (endDateInput) {
        endDateInput.addEventListener('change', autoApplyPeriodSettings);
    }
}

// 기간 설정 자동 적용 (검색하지 않음)
function autoApplyPeriodSettings() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    
    if (!startDate || !endDate) {
        return; // 두 날짜가 모두 입력되지 않았으면 적용하지 않음
    }
    
    if (startDate > endDate) {
        return; // 시작일이 종료일보다 늦으면 적용하지 않음
    }
    
    currentPeriodSettings = {
        startDate: startDate,
        endDate: endDate,
        isActive: true
    };
    
    // 활성 상태 표시만 하고 검색은 하지 않음
    showPeriodActiveStatus();
}

// 기간 설정 업데이트 (날짜만 변경, 검색하지 않음)
function updatePeriodSettings() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    
    if (!startDate || !endDate) {
        return; // 두 날짜가 모두 입력되지 않았으면 적용하지 않음
    }
    
    if (startDate > endDate) {
        return; // 시작일이 종료일보다 늦으면 적용하지 않음
    }
    
    currentPeriodSettings = {
        startDate: startDate,
        endDate: endDate,
        isActive: true
    };
    
    // 활성 상태 표시
    showPeriodActiveStatus();
    
    // 검색은 하지 않고 설정만 업데이트
}

// 기간 설정 초기화 함수 제거됨

// 기간별 뉴스 로드
function loadNewsByPeriod() {
    showLoading();
    
    const params = new URLSearchParams({
        start_date: currentPeriodSettings.startDate,
        end_date: currentPeriodSettings.endDate
    });
    
    fetch(`/api/news/period?${params}`)
        .then(response => response.json())
        .then(data => {
            hideLoading();
            // 기간별 뉴스도 팝업으로 표시
            showNewsResultsModal(data);
        })
        .catch(error => {
            hideLoading();
            console.error('Error loading news by period:', error);
            showError('기간별 뉴스를 불러오는 중 오류가 발생했습니다.');
            hideSearchResultsInfo(0, true, currentPeriodSettings.startDate, currentPeriodSettings.endDate); // 검색 결과 개수 숨기기
        });
}

// 기간별 검색 수행
function performPeriodSearch() {
    console.log('performPeriodSearch called');
    console.log('currentSearchQuery:', currentSearchQuery);
    console.log('currentPeriodSettings:', currentPeriodSettings);
    
    if (!currentSearchQuery) {
        console.error('No search query available');
        hideLoading();
        showNoResults();
        return;
    }
    
    showLoading();
    
    // 설정 불러오기
    const settings = getSettings();
    
    const params = new URLSearchParams({
        q: currentSearchQuery,
        start_date: currentPeriodSettings.startDate,
        end_date: currentPeriodSettings.endDate,
        // 검색 소스 설정
        naver: settings.naverSearchEnabled !== false,
        google: settings.googleSearchEnabled !== false,
        // 중복도율 설정
        duplicate_threshold: currentDuplicateThreshold,
        // 네이버 필터링 설정
        naver_title_filter: settings.naverTitleFilter !== false
    });
    
    console.log('Period search URL params:', params.toString());
    
    // 시뮬레이션 없이 기본 검색 상태만 표시
    
    fetch(`/api/search/period?${params}`)
        .then(response => response.json())
        .then(data => {
            console.log('Period search response:', data);
            hideLoading();
            
            // 최종 결과 통계 계산
            const finalStats = {
                foundNewsCount: data.total_before_dedup || data.results.length,
                duplicatesRemoved: data.duplicates_removed || 0,
                finalNewsCount: data.total_after_dedup || data.results.length
            };
            
            // 1단계: 찾은 뉴스 개수 표시
            updateSearchProgress('processing', `${currentSearchQuery}에 대해 찾은 뉴스의 중복을 제거하고 있습니다.`, 70, {
                foundNewsCount: finalStats.foundNewsCount
            });
            
            // 2단계: 중복 제거 완료 후 최종 결과 표시
            setTimeout(() => {
                completeSearchProgress(finalStats);
                
                // 3단계: 진행 팝업이 완전히 끝난 후 결과 팝업 표시
                setTimeout(() => {
            if (data.results && data.results.length > 0) {
                showNewsResultsModal(data);
            } else {
                showNoResults(data);
                        hideSearchResultsInfo(0, true, currentPeriodSettings.startDate, currentPeriodSettings.endDate);
            }
                }, 2200); // 완료 메시지 표시 + 모달 닫기 시간 후
            }, 1200);
        })
        .catch(error => {
            console.error('Error performing period search:', error);
            hideLoading();
            showNoResults();
            hideSearchResultsInfo(0, true, currentPeriodSettings.startDate, currentPeriodSettings.endDate); // 검색 결과 개수 숨기기
            
            // 에러 시 진행상태 모달 닫기
            hideSearchProgressModal();
        });
}

// 기간 활성 상태 표시
function showPeriodActiveStatus() {
    const periodHeader = document.querySelector('.period-header');
    if (periodHeader) {
        periodHeader.style.backgroundColor = '#e6f3ff';
        periodHeader.style.borderLeft = '4px solid #4299e1';
    }
}

// 기간 활성 상태 숨기기
function hidePeriodActiveStatus() {
    const periodHeader = document.querySelector('.period-header');
    if (periodHeader) {
        periodHeader.style.backgroundColor = '';
        periodHeader.style.borderLeft = '';
    }
}

// 기간 설정 완료 메시지 표시
function showPeriodAppliedMessage() {
    // 기존 메시지 제거
    const existingMessage = document.querySelector('.period-applied-message');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    // 새 메시지 생성
    const message = document.createElement('div');
    message.className = 'period-applied-message';
    message.innerHTML = `
        <div class="period-applied-content">
            <i class="fas fa-check-circle"></i>
            <span>기간 설정이 적용되었습니다. (${formatDate(currentPeriodSettings.startDate)} ~ ${formatDate(currentPeriodSettings.endDate)})</span>
            <button class="period-applied-close" onclick="this.parentElement.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    // 메시지를 페이지에 추가
    document.body.appendChild(message);
    
    // 5초 후 자동으로 제거
    setTimeout(() => {
        if (message.parentElement) {
            message.remove();
        }
    }, 5000);
}

// 날짜 포맷팅
function formatDate(dateString) {
    if (!dateString) return '날짜 없음';
    
    try {
    const date = new Date(dateString);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        
        // 요일 배열 (한국어)
        const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
        const weekday = weekdays[date.getDay()];
        
        return `${year}년 ${month}월 ${day}일 (${weekday}) ${hours}:${minutes}`;
    } catch (error) {
        return '날짜 오류';
    }
}

// 기존 setupEventListeners 함수에 기간 설정 초기화 추가
const originalSetupEventListeners = setupEventListeners;
setupEventListeners = function() {
    originalSetupEventListeners();
    initializePeriodSettings();
    initializeDuplicateThreshold();
    initializeAiModel();
    initializeCompanyList();
};

// 중복도율 설정 관련 전역 변수
let currentDuplicateThreshold = 50; // 기본값 50%

// AI 모델 설정 관련 전역 변수
let currentAiModel = 'gpt-4o-mini'; // 기본값 gpt-4o-mini

// 기업 목록 데이터 (DB에서 로드)
let companyData = [];

let currentYearFilter = 'all';
let selectedCompany = null;

// 페이지 로드 시 기업 데이터 로드
async function loadCompanyData() {
    console.log('[DEBUG] loadCompanyData 시작');
    try {
        const response = await fetch('/api/companies');
        console.log('[DEBUG] API 응답:', response);
        const data = await response.json();
        console.log('[DEBUG] API 데이터:', data);
        
        if (data.success) {
            console.log('[DEBUG] data.success = true');
            // companies_by_year를 flat array로 변환
            companyData = [];
            for (const year in data.companies_by_year) {
                data.companies_by_year[year].forEach(company => {
                    companyData.push({
                        id: company.id,
                        year: company.year,
                        name: company.name
                    });
                });
            }
            
            console.log(`[INFO] 기업 데이터 로드 완료: ${companyData.length}개`);
            console.log('[DEBUG] companyData:', companyData);
            
            // 연도 필터 버튼 생성
            createYearFilterButtons();
            
            // 기업 목록 렌더링
            console.log('[DEBUG] renderCompanyList 호출 직전');
            renderCompanyList();
            console.log('[DEBUG] renderCompanyList 호출 완료');
        } else {
            console.error('[ERROR] 기업 데이터 로드 실패 - data.success = false');
            console.error('[ERROR] 응답 데이터:', data);
        }
    } catch (error) {
        console.error('[ERROR] 기업 데이터 로드 실패:', error);
        console.error('[ERROR] 에러 스택:', error.stack);
    }
}

// 연도 필터 버튼 동적 생성
function createYearFilterButtons() {
    const yearFilter = document.getElementById('yearFilter');
    if (!yearFilter) return;
    
    // 중복 제거하여 연도 목록 추출
    const years = [...new Set(companyData.map(c => c.year))].sort((a, b) => a - b);
    
    console.log('[DEBUG] 추출된 연도 목록:', years);
    
    // 기존 연도 버튼 제거 (전체 버튼은 유지)
    const existingYearButtons = yearFilter.querySelectorAll('.year-btn:not([data-year="all"])');
    existingYearButtons.forEach(btn => btn.remove());
    
    // 연도별 버튼 생성
    years.forEach(year => {
        const button = document.createElement('button');
        button.className = 'year-btn';
        button.setAttribute('data-year', year);
        button.textContent = year;
        yearFilter.appendChild(button);
    });
    
    // 연도 필터 이벤트 다시 설정
    setupYearFilter();
}

// 중복도율 설정 초기화
function initializeDuplicateThreshold() {
    const thresholdSlider = document.getElementById('duplicateThreshold');
    const thresholdValue = document.getElementById('thresholdValue');
    
    if (thresholdSlider && thresholdValue) {
        // 로컬 스토리지에서 저장된 설정 로드
        const settings = getSettings();
        if (settings.duplicateThreshold !== undefined) {
            currentDuplicateThreshold = settings.duplicateThreshold;
            thresholdSlider.value = currentDuplicateThreshold;
        }
        
        // 초기 값 표시
        thresholdValue.textContent = currentDuplicateThreshold + '%';
        
        // 슬라이더 변경 이벤트 리스너
        thresholdSlider.addEventListener('input', function() {
            currentDuplicateThreshold = parseInt(this.value);
            thresholdValue.textContent = currentDuplicateThreshold + '%';
            
            // 현재 검색 중이면 자동으로 재검색
            if (currentSearchQuery) {
                console.log(`중복도율이 ${currentDuplicateThreshold}%로 변경되었습니다.`);
                // 자동 재검색은 하지 않고 사용자가 직접 검색하도록 함
            }
        });
        
        // 슬라이더 변경 완료 이벤트 (마우스 또는 터치 완료)
        thresholdSlider.addEventListener('change', function() {
            console.log(`중복 판정 임계값: ${currentDuplicateThreshold}%`);
            
            // 설정 변경 알림 메시지 표시 (선택사항)
            showThresholdChangeMessage();
        });
    }
}

// 중복도율 변경 메시지 표시
function showThresholdChangeMessage() {
    // 기존 메시지 제거
    const existingMessage = document.querySelector('.threshold-change-message');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    // 새 메시지 생성
    const message = document.createElement('div');
    message.className = 'threshold-change-message';
    message.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #28a745;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 10000;
        font-size: 14px;
        font-weight: 500;
        animation: slideInRight 0.3s ease;
    `;
    message.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
            <i class="fas fa-check-circle"></i>
            <span>중복 판정 임계값이 ${currentDuplicateThreshold}%로 설정되었습니다</span>
        </div>
    `;
    
    document.body.appendChild(message);
    
    // 3초 후 자동 제거
    setTimeout(() => {
        if (message.parentElement) {
            message.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
                if (message.parentElement) {
                    message.remove();
                }
            }, 300);
        }
    }, 3000);
}

// CSS 애니메이션 추가
if (!document.querySelector('#threshold-animations')) {
    const style = document.createElement('style');
    style.id = 'threshold-animations';
    style.textContent = `
        @keyframes slideInRight {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        
        @keyframes slideOutRight {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
}

// AI 모델 설정 초기화
function initializeAiModel() {
    const aiModelSelect = document.getElementById('aiModel');
    const priceValue = document.getElementById('priceValue');
    
    // 모델별 가격 정보
    const modelPrices = {
        'gpt-4o-mini': {
            input: '$0.15',
            output: '$0.60'
        },
        'gpt-4o': {
            input: '$2.50',
            output: '$10.00'
        }
    };
    
    if (aiModelSelect && priceValue) {
        // 로컬 스토리지에서 저장된 값 로드
        const savedModel = localStorage.getItem('aiModel');
        if (savedModel && modelPrices[savedModel]) {
            currentAiModel = savedModel;
            aiModelSelect.value = currentAiModel;
        }
        
        // 가격 정보 업데이트 함수
        function updatePriceInfo(model) {
            const prices = modelPrices[model];
            if (prices) {
                priceValue.textContent = `입력: ${prices.input}, 출력: ${prices.output}`;
            }
        }
        
        // 초기 가격 정보 표시
        updatePriceInfo(currentAiModel);
        
        // 모델 변경 이벤트 리스너
        aiModelSelect.addEventListener('change', function() {
            currentAiModel = this.value;
            updatePriceInfo(currentAiModel);
            
            // 로컬 스토리지에 저장
            localStorage.setItem('aiModel', currentAiModel);
            
            console.log(`AI 모델이 ${currentAiModel}로 변경되었습니다.`);
            showAiModelChangeMessage();
        });
        
        // Temperature 슬라이더 이벤트 리스너
        const temperatureSlider = document.getElementById('temperature');
        const temperatureValue = document.getElementById('temperatureValue');
        if (temperatureSlider && temperatureValue) {
            temperatureSlider.addEventListener('input', function() {
                temperatureValue.textContent = this.value;
            });
        }
    }
}

// AI 모델 변경 알림 메시지 표시
function showAiModelChangeMessage() {
    const modelName = currentAiModel === 'gpt-4o-mini' ? 'GPT-4o-mini (경제적)' : 'GPT-4o (고성능)';
    
    // 임시 알림 요소 생성
    const notification = document.createElement('div');
    notification.className = 'ai-model-notification';
    notification.innerHTML = `
        <i class="fas fa-robot"></i>
        <span>AI 모델이 ${modelName}로 변경되었습니다.</span>
    `;
    
    // 스타일 설정
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #28a745;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        font-size: 14px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 8px;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // 3초 후 자동 제거
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// 기업 목록 초기화
function initializeCompanyList() {
    renderCompanyList();
    setupYearFilter();
    setupCompanySelection();
}

// 기업 목록 렌더링
function renderCompanyList() {
    const companyGrid = document.getElementById('companyGrid');
    console.log('[DEBUG] renderCompanyList 호출됨');
    console.log('[DEBUG] companyGrid:', companyGrid);
    console.log('[DEBUG] companyData:', companyData);
    console.log('[DEBUG] currentYearFilter:', currentYearFilter);
    
    if (!companyGrid) {
        console.warn('[WARN] companyGrid 요소를 찾을 수 없습니다.');
        return;
    }
    
    // 현재 필터에 따라 기업 목록 필터링
    const filteredCompanies = currentYearFilter === 'all' 
        ? companyData 
        : companyData.filter(company => company.year === parseInt(currentYearFilter));
    
    console.log('[DEBUG] filteredCompanies:', filteredCompanies);
    
    // 기업 목록 HTML 생성
    companyGrid.innerHTML = filteredCompanies.map(company => `
        <div class="company-item" data-company="${company.name}" data-year="${company.year}">
            <div class="company-name">${company.name}</div>
        </div>
    `).join('');
    
    console.log('[DEBUG] companyGrid.innerHTML 설정 완료');
    
    // 기업 선택 이벤트 설정
    setupCompanySelection();
}

// 연도 필터 설정
function setupYearFilter() {
    const yearButtons = document.querySelectorAll('.year-btn');
    
    yearButtons.forEach(button => {
        button.addEventListener('click', function() {
            // 모든 버튼에서 active 클래스 제거
            yearButtons.forEach(btn => btn.classList.remove('active'));
            
            // 클릭된 버튼에 active 클래스 추가
            this.classList.add('active');
            
            // 현재 필터 업데이트
            currentYearFilter = this.dataset.year;
            
            // 기업 목록 다시 렌더링
            renderCompanyList();
            
            // 기업 선택 이벤트 다시 설정
            setupCompanySelection();
            
            console.log(`연도 필터: ${currentYearFilter}`);
        });
    });
}

// 기업 선택 설정
function setupCompanySelection() {
    const companyItems = document.querySelectorAll('.company-item');
    
    companyItems.forEach(item => {
        item.addEventListener('click', function() {
            // 모든 기업에서 selected 클래스 제거
            companyItems.forEach(company => company.classList.remove('selected'));
            
            // 클릭된 기업에 selected 클래스 추가
            this.classList.add('selected');
            
            // 선택된 기업 정보 저장
            selectedCompany = {
                name: this.dataset.company,
                year: parseInt(this.dataset.year)
            };
            
            // 검색창에 기업명 입력
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.value = selectedCompany.name;
                searchInput.focus();
            }
            
            console.log(`선택된 기업: ${selectedCompany.name} (${selectedCompany.year}년)`);
            
            // 선택 알림 메시지 표시
            showCompanySelectionMessage();
        });
    });
}

// 기업 선택 알림 메시지
function showCompanySelectionMessage() {
    // 임시 알림 요소 생성
    const notification = document.createElement('div');
    notification.className = 'company-selection-notification';
    notification.innerHTML = `
        <i class="fas fa-building"></i>
        <span>${selectedCompany.name} (${selectedCompany.year}년)이 선택되었습니다.</span>
    `;
    
    // 스타일 설정
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #007bff;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        font-size: 14px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 8px;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // 3초 후 자동 제거
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 2500);
}

// 검색 진행상태 모달 관리 함수들
function showSearchProgressModal(query) {
    const modal = document.getElementById('searchProgressModal');
    const searchQuery = document.getElementById('searchQuery');
    const searchProgressMessage = document.getElementById('searchProgressMessage');
    const searchStepIcon = document.getElementById('searchStepIcon');
    const searchStepText = document.getElementById('searchStepText');
    const searchProgressBar = document.getElementById('searchProgressBar');
    const searchSpinner = document.getElementById('searchSpinner');
    
    // 초기 상태 설정
    searchQuery.textContent = query;
    searchProgressMessage.innerHTML = `${query}에 대한 뉴스를 찾고 있습니다... <div class="search-spinner"></div>`;
    searchStepIcon.className = 'fas fa-search searching';
    searchStepText.textContent = `${query} 뉴스 검색 중...`;
    searchProgressBar.style.width = '20%';
    
    // 통계 초기화
    document.getElementById('foundNewsCount').textContent = '0개';
    document.getElementById('duplicatesRemoved').textContent = '0개';
    document.getElementById('finalNewsCount').textContent = '0개';
    
    // 모달 즉시 표시 (애니메이션 없이)
    modal.classList.add('show');
}

function updateSearchProgress(step, message, progress, stats = {}) {
    const searchProgressMessage = document.getElementById('searchProgressMessage');
    const searchStepIcon = document.getElementById('searchStepIcon');
    const searchStepText = document.getElementById('searchStepText');
    const searchProgressBar = document.getElementById('searchProgressBar');
    
    // 메시지와 스피너 업데이트
    if (step === 'searching') {
        searchProgressMessage.innerHTML = `${message} <div class="search-spinner"></div>`;
    } else if (step === 'processing') {
        searchProgressMessage.innerHTML = `${message} <div class="search-spinner"></div>`;
    } else {
        searchProgressMessage.textContent = message; // 완료 시에는 스피너 제거
    }
    
    searchStepText.textContent = message;
    searchProgressBar.style.width = progress + '%';
    
    // 단계별 아이콘 변경
    switch(step) {
        case 'searching':
            searchStepIcon.className = 'fas fa-search searching';
            break;
        case 'processing':
            searchStepIcon.className = 'fas fa-filter processing';
            break;
        case 'completed':
            searchStepIcon.className = 'fas fa-check-circle completed';
            break;
        default:
            searchStepIcon.className = 'fas fa-search searching';
    }
    
    // 통계 업데이트
    if (stats.foundNewsCount !== undefined) {
        document.getElementById('foundNewsCount').textContent = stats.foundNewsCount + '개';
    }
    if (stats.duplicatesRemoved !== undefined) {
        document.getElementById('duplicatesRemoved').textContent = stats.duplicatesRemoved + '개';
    }
    if (stats.finalNewsCount !== undefined) {
        document.getElementById('finalNewsCount').textContent = stats.finalNewsCount + '개';
    }
}

function hideSearchProgressModal() {
    const modal = document.getElementById('searchProgressModal');
    modal.classList.remove('show');
}

// 시뮬레이션 관련 함수들 제거됨 - 실제 API 데이터만 사용

// 검색 완료 후 자동으로 모달 닫기 (2초 후)
function completeSearchProgress(finalStats) {
    const currentQuery = searchInput.value.trim();
    updateSearchProgress('completed', `${currentQuery} 검색이 완료되었습니다!`, 100, finalStats);
    
    setTimeout(() => {
        hideSearchProgressModal();
    }, 2000);
}

// 검색 결과 개수 표시 함수
function showSearchResultsInfo(count, isPeriodSearch = false, startDate = null, endDate = null) {
    const resultsInfo = document.getElementById('searchResultsInfo');
    const resultsCount = document.getElementById('resultsCount');
    const resultsText = document.getElementById('resultsText');
    const resultsPeriod = document.getElementById('resultsPeriod');
    
    if (count > 0) {
        resultsCount.textContent = count;
        resultsText.textContent = '개의 뉴스';
        
        // 기간 검색인 경우 기간 정보 표시
        if (isPeriodSearch && startDate && endDate) {
            resultsPeriod.textContent = `(기간: ${formatDate(startDate)} ~ ${formatDate(endDate)})`;
        } else {
            resultsPeriod.textContent = '';
        }
        
        resultsInfo.style.display = 'block';
    } else {
        resultsInfo.style.display = 'none';
    }
}

// 검색 결과 개수 숨기기
function hideSearchResultsInfo() {
    const resultsInfo = document.getElementById('searchResultsInfo');
    resultsInfo.style.display = 'none';
}

// 리소스 정리 함수
function cleanupResources() {
    console.log('리소스 정리 시작');
    
    // EventSource 정리
    if (currentEventSource) {
        console.log('EventSource 정리');
        currentEventSource.close();
        currentEventSource = null;
    }
    
    // 타임아웃 정리
    if (currentTimeout) {
        console.log('타임아웃 정리');
        clearTimeout(currentTimeout);
        currentTimeout = null;
    }
    
    // 진행 모달 숨기기
    hideProgressModal();
    hideSearchProgressModal();
    
    // 분석 결과 초기화
    clearPreviousAnalysis();
    
    console.log('리소스 정리 완료');
}

// 이전 분석 결과 초기화 함수
function clearPreviousAnalysis() {
    console.log('[DEBUG] ===== 이전 분석 결과 초기화 시작 =====');
    
    // 현재 분석 결과 초기화
    currentAnalysisResult = null;
    console.log('[DEBUG] currentAnalysisResult 초기화 완료');
    
    // AI 분석 결과 영역 초기화
    const aiAnalysisContent = document.getElementById('aiAnalysisContent');
    if (aiAnalysisContent) {
        const originalContent = aiAnalysisContent.innerHTML;
        console.log('[DEBUG] 기존 aiAnalysisContent 내용 길이:', originalContent.length);
        aiAnalysisContent.innerHTML = '';
        console.log('[DEBUG] aiAnalysisContent 초기화 완료');
    } else {
        console.error('[DEBUG] aiAnalysisContent 요소를 찾을 수 없습니다!');
    }
    
    // 분석 버튼들 숨기기
    const analysisButtons = document.getElementById('analysisButtons');
    if (analysisButtons) {
        analysisButtons.style.display = 'none';
        console.log('[DEBUG] analysisButtons 숨김 완료');
    }
    
    // 분석 오류 메시지 숨기기
    const analysisError = document.getElementById('analysisError');
    if (analysisError) {
        analysisError.style.display = 'none';
        console.log('[DEBUG] analysisError 숨김 완료');
    }
    
    // 로딩 상태 초기화
    loading.style.display = 'none';
    console.log('[DEBUG] loading 숨김 완료');
    
    // EventSource 연결 정리
    if (currentEventSource) {
        console.log('[DEBUG] 기존 EventSource 연결 정리');
        currentEventSource.close();
        currentEventSource = null;
    }
    
    // 타임아웃 정리
    if (currentTimeout) {
        console.log('[DEBUG] 기존 타임아웃 정리');
        clearTimeout(currentTimeout);
        currentTimeout = null;
    }
    
    // 진행 모달 숨기기
    hideProgressModal();
    console.log('[DEBUG] 진행 모달 숨김 완료');
    
    // 메모리 정리 (가비지 컬렉션 유도)
    setTimeout(() => {
        if (window.gc) {
            window.gc();
            console.log('[DEBUG] 가비지 컬렉션 실행');
        }
    }, 100);
    
    console.log('[DEBUG] ===== 이전 분석 결과 초기화 완료 =====');
}

// 테스트용 분석 결과 표시 함수
function testDisplayAnalysis() {
    console.log('[DEBUG] ===== 테스트 분석 결과 표시 시작 =====');
    
    const testData = {
        "success": true,
        "company_name": "테스트기업",
        "analyzed_news": [
            {
                "news_info": {
                    "title": "테스트 뉴스 제목",
                    "description": "테스트 뉴스 내용입니다.",
                    "source": "테스트 언론사",
                    "published": "2024-01-01",
                    "link": "https://example.com"
                },
                "trend_analysis": {
                    "news_trend_summary": "긍정적인 동향을 보이고 있습니다.",
                    "sentiment_score": 3.5,
                    "sentiment_label": "긍정적"
                },
                "award_analysis": {
                    "is_award_related": "N",
                    "award_reason": "수상 관련 내용이 없습니다.",
                    "award_name": ""
                },
                "investment_analysis": {
                    "is_investment_related": "N",
                    "investment_reason": "투자 관련 내용이 없습니다.",
                    "investment_name": ""
                }
            }
        ],
        "comprehensive_opinion": "테스트 기업에 대한 종합 분석 결과입니다. 이는 테스트용 데이터입니다."
    };
    
    console.log('[DEBUG] 테스트 데이터:', testData);
    displayAllAnalysisOnMain(testData);
    console.log('[DEBUG] ===== 테스트 분석 결과 표시 완료 =====');
}

// 강제 종료 함수
function forceStopAnalysis() {
    if (confirm('정말로 분석을 중단하시겠습니까?\n\n현재 진행 중인 작업이 완료되지 않을 수 있습니다.')) {
        console.log('사용자가 분석을 강제 종료했습니다.');
        
        // 진행 메시지 업데이트
        const progressMessage = document.getElementById('progressMessage');
        if (progressMessage) {
            progressMessage.innerHTML = '<i class="fas fa-stop-circle message-spinner"></i><span class="message-text">분석을 중단하고 있습니다...</span>';
        }
        
        // 리소스 정리
        cleanupResources();
        
        // 이전 분석 결과 초기화
        clearPreviousAnalysis();
        
        // 사용자에게 알림
        setTimeout(() => {
            alert('분석이 중단되었습니다.');
        }, 1000);
    }
} 

// 뉴스 분석 관련 함수들
function showAnalyzeModal() {
    analyzeModal.classList.add('show');
    // 분석 결과 영역을 바로 표시
    document.getElementById('analyzeResults').style.display = 'block';
}

function hideAnalyzeModal() {
    analyzeModal.classList.remove('show');
    document.getElementById('companyNameInput').value = '';
    hideAnalyzeResults();
}

function hideAnalyzeResults() {
    document.getElementById('analyzeResults').style.display = 'none';
    document.getElementById('analyzeContent').innerHTML = '';
}

function showAnalyzeLoading() {
    document.getElementById('analyzeResults').style.display = 'block';
    document.getElementById('analyzeLoading').style.display = 'block';
    document.getElementById('analyzeContent').innerHTML = '';
    
    // 분석 버튼들 숨기기
    const analysisButtons = document.getElementById('analysisButtons');
    if (analysisButtons) {
        analysisButtons.style.display = 'none';
    }
    

}



// 검색된 뉴스를 직접 분석하는 함수
function analyzeSearchedNews(newsData) {
    console.log('[DEBUG] analyzeSearchedNews 함수 호출됨');
    console.log('[DEBUG] 뉴스 데이터 수:', newsData.length);
    
    const companyName = searchInput.value.trim();
    console.log('[DEBUG] 회사명:', companyName);
    
    if (!companyName) {
        alert('검색창에 기업명을 입력해주세요.');
        return;
    }
    
    if (!newsData || newsData.length === 0) {
        alert('분석할 뉴스가 없습니다.');
        return;
    }
    
    // 진행 정보 모달 표시 (초기화는 나중에)
    showProgressModal();
    
    // 뉴스 데이터를 백엔드로 전송하여 분석
    const requestData = {
        company: companyName,
        ai_model: currentAiModel,
        news_data: newsData
    };
    
    console.log('[DEBUG] 분석 요청 데이터:', requestData);
    
    // 분석 API 호출
    fetch('/api/analyze/direct', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        },
        body: JSON.stringify(requestData)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.body.getReader();
    })
    .then(reader => {
        const decoder = new TextDecoder();
        let buffer = '';  // 불완전한 데이터를 버퍼링
        
        function readStream() {
            return reader.read().then(({done, value}) => {
                if (done) {
                    return;
                }
                
                const chunk = decoder.decode(value);
                buffer += chunk;  // 버퍼에 추가
                
                // 완전한 라인들만 처리
                const lines = buffer.split('\n');
                // 마지막 라인은 불완전할 수 있으므로 버퍼에 남김
                buffer = lines.pop() || '';
                
                lines.forEach(line => {
                    if (line.startsWith('data: ')) {
                        try {
                            const jsonString = line.slice(6).trim();
                            if (!jsonString) return;  // 빈 문자열 무시
                            
                            const data = JSON.parse(jsonString);
                            console.log('[DEBUG] 스트림 데이터:', data);
                            
                            switch (data.type) {
                                case 'progress':
                                    console.log('[DEBUG] 진행 정보 수신:', data);
                                    updateProgressInfo(data);
                                    break;
                                case 'complete':
                                    console.log('[DEBUG] ===== 분석 완료 데이터 수신 =====');
                                    console.log('[DEBUG] 완료 데이터 전체:', JSON.stringify(data, null, 2));
                                    console.log('[DEBUG] data.data 존재:', !!data.data);
                                    console.log('[DEBUG] data.result 존재:', !!data.result);
                                    
                                    // 데이터 검증
                                    if (!data.data && !data.result) {
                                        console.error('[DEBUG] 완료 데이터에 분석 결과가 없습니다!');
                                        console.error('[DEBUG] data 객체:', data);
                                        hideProgressModal();
                                        clearPreviousAnalysis();
                                        showCompletionModal('알 수 없음', 0);  // 일단 모달은 표시
                                        return;
                                    }
                                    
                                    // 데이터 구조 통일
                                    const analysisData = data.data || data.result;
                                    console.log('[DEBUG] 통일된 분석 데이터:', analysisData);
                                    
                                    // 데이터 유효성 검사
                                    if (!analysisData || typeof analysisData !== 'object') {
                                        console.error('[DEBUG] 분석 데이터가 유효하지 않습니다:', analysisData);
                                        hideProgressModal();
                                        clearPreviousAnalysis();
                                        showAnalysisErrorOnMain('분석 데이터가 유효하지 않습니다.');
                                        return;
                                    }
                                    
                                    if (!analysisData.success) {
                                        console.error('[DEBUG] 분석이 실패했습니다:', analysisData.message);
                                        hideProgressModal();
                                        clearPreviousAnalysis();
                                        showAnalysisErrorOnMain(analysisData.message || '분석이 실패했습니다.');
                                        return;
                                    }
                                    
                                    if (!analysisData.company_name) {
                                        console.error('[DEBUG] 회사명이 없습니다:', analysisData);
                                        hideProgressModal();
                                        clearPreviousAnalysis();
                                        showAnalysisErrorOnMain('분석 결과에 회사명이 없습니다.');
                                        return;
                                    }
                                    
                                    if (!analysisData.analyzed_news || !Array.isArray(analysisData.analyzed_news)) {
                                        console.error('[DEBUG] 분석된 뉴스가 없거나 배열이 아닙니다:', analysisData.analyzed_news);
                                        hideProgressModal();
                                        clearPreviousAnalysis();
                                        showAnalysisErrorOnMain('분석된 뉴스 데이터가 유효하지 않습니다.');
                                        return;
                                    }
                                    
                                    console.log('[DEBUG] ===== 데이터 검증 통과 =====');
                                    console.log('[DEBUG] 회사명:', analysisData.company_name);
                                    console.log('[DEBUG] 분석된 뉴스 수:', analysisData.analyzed_news.length);
                                    console.log('[DEBUG] 종합의견:', analysisData.comprehensive_opinion ? '있음' : '없음');
                                    
                                    // 모달 닫기
                                    hideProgressModal();
                                    console.log('[DEBUG] 진행 모달 닫기 완료');
                                    
                                    // 완료 모달 표시
                                    console.log('[DEBUG] ===== 완료 모달 표시 시도 =====');
                                    showCompletionModal(analysisData.company_name, analysisData.analyzed_news.length);
                                    console.log('[DEBUG] ===== 완료 모달 표시 완료 =====');
                                    
                                    // 엑셀 자동 저장 (백그라운드)
                                    console.log('[DEBUG] ===== 엑셀 자동 저장 시작 (백그라운드) =====');
                                    requestAutoSave(analysisData)
                                        .then(() => {
                                            console.log('[DEBUG] ===== 엑셀 자동 저장 성공 =====');
                                            
                                            // AI 분석결과 자료실 목록 새로고침
                                            if (typeof loadArchiveList === 'function') {
                                                console.log('[DEBUG] AI 분석결과 자료실 목록 새로고침 시작');
                                                loadArchiveList().then(() => {
                                                    console.log('[DEBUG] AI 분석결과 자료실 목록 새로고침 완료');
                                                }).catch((refreshError) => {
                                                    console.error('[DEBUG] AI 분석결과 자료실 목록 새로고침 실패:', refreshError);
                                                });
                                            }
                                        })
                                        .catch((saveError) => {
                                            console.error('[DEBUG] ===== 엑셀 자동 저장 실패 =====');
                                            console.error('[DEBUG] 저장 실패 원인:', saveError.message);
                                            console.error('[DEBUG] 저장 실패 스택:', saveError.stack);
                                        });
                                    
                                    break;
                                case 'error':
                                    console.error('[DEBUG] 분석 중 오류 발생:', data.message);
                                    
                                    // 모달 닫기
                                    hideProgressModal();
                                    
                                    // 간단한 알림 표시
                                    alert('AI 분석 중 오류가 발생했습니다.\n' + (data.message || '알 수 없는 오류'));
                                    break;
                                default:
                                    console.log('[DEBUG] 알 수 없는 데이터 타입:', data.type);
                            }
                        } catch (parseError) {
                            console.error('[DEBUG] JSON 파싱 오류:', parseError);
                            console.error('[DEBUG] 원본 라인:', line);
                        }
                    }
                });
                
                return readStream();
            });
        }
        
        return readStream();
    })
    .catch(error => {
        console.error('[ERROR] 분석 요청 실패:', error);
        console.error('[ERROR] 오류 스택:', error.stack);
        
        // 모달 닫기
        hideProgressModal();
        
        // 간단한 알림 표시
        alert('AI 분석 요청 중 오류가 발생했습니다.\n' + (error.message || '알 수 없는 오류'));
    });
}

// 분석 완료 시 AI 분석결과 자료실 자동 저장 요청 함수
async function requestAutoSave(analysisResult) {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('[DEBUG] ===== requestAutoSave 시작 =====');
            console.log('[DEBUG] 분석 결과:', analysisResult);
            
            if (!analysisResult) {
                console.error('[DEBUG] 분석 결과가 없습니다!');
                reject(new Error('분석 결과가 없습니다'));
                return;
            }
            
            if (!analysisResult.company_name) {
                console.error('[DEBUG] 회사명이 없습니다!');
                reject(new Error('회사명이 없습니다'));
                return;
            }
            
            if (!analysisResult.analyzed_news || analysisResult.analyzed_news.length === 0) {
                console.error('[DEBUG] 분석된 뉴스가 없습니다!');
                reject(new Error('분석된 뉴스가 없습니다'));
                return;
            }
            
            const requestData = {
                company_name: analysisResult.company_name,
                analyzed_news: analysisResult.analyzed_news,
                comprehensive_opinion: analysisResult.comprehensive_opinion || '',
                start_date: currentPeriodSettings && currentPeriodSettings.isActive ? currentPeriodSettings.startDate : '',
                end_date: currentPeriodSettings && currentPeriodSettings.isActive ? currentPeriodSettings.endDate : ''
            };
            
            console.log('[DEBUG] 자동 저장 요청 데이터:', requestData);
            console.log('[DEBUG] 분석된 뉴스 수:', analysisResult.analyzed_news ? analysisResult.analyzed_news.length : 0);
            console.log('[DEBUG] 종합의견 길이:', analysisResult.comprehensive_opinion ? analysisResult.comprehensive_opinion.length : 0);
            
            // 저장 요청 전 잠시 대기 (이전 요청 완료 대기)
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // 엑셀 저장 API 호출
            const response = await fetch('/api/export/excel', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestData)
            });
            
            console.log('[DEBUG] 엑셀 저장 API 응답 상태:', response.status);
            console.log('[DEBUG] 엑셀 저장 API Content-Type:', response.headers.get('Content-Type'));
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('[DEBUG] 엑셀 저장 API 오류:', errorText);
                throw new Error(`엑셀 저장 실패: ${response.status} ${response.statusText}`);
            }
            
            // Content-Type 확인하여 JSON인지 엑셀 파일인지 구분
            const contentType = response.headers.get('Content-Type') || '';
            
            if (contentType.includes('application/json')) {
                // JSON 응답인 경우
            const result = await response.json();
            console.log('[DEBUG] 엑셀 저장 API 응답:', result);
            
            if (result.success) {
                console.log('[DEBUG] ===== 엑셀 저장 성공 =====');
                console.log('[DEBUG] 저장된 파일명:', result.filename);
                resolve(result);
            } else {
                console.error('[DEBUG] 엑셀 저장 실패:', result.error);
                reject(new Error(result.error || '엑셀 저장에 실패했습니다.'));
                }
            } else if (contentType.includes('application/vnd.openxmlformats') || contentType.includes('application/vnd.ms-excel')) {
                // 엑셀 파일이 직접 반환된 경우 (자동 저장 성공으로 간주)
                console.log('[DEBUG] ===== 엑셀 파일 직접 반환됨 (자동 저장 성공) =====');
                resolve({ success: true, message: '엑셀 파일이 성공적으로 생성되었습니다.' });
            } else {
                // 알 수 없는 Content-Type
                console.warn('[DEBUG] 알 수 없는 Content-Type:', contentType);
                console.log('[DEBUG] 일단 성공으로 간주합니다.');
                resolve({ success: true, message: '저장 완료' });
            }
            
        } catch (error) {
            console.error('[DEBUG] requestAutoSave 오류:', error);
            console.error('[DEBUG] 오류 스택:', error.stack);
            reject(error);
        }
    });
}

function analyzeAll() {
    console.log('[DEBUG] analyzeAll 함수 호출됨');
    const companyName = searchInput.value.trim();
    console.log('[DEBUG] 회사명:', companyName);
    
    if (!companyName) {
        alert('검색창에 기업명을 입력해주세요.');
        return;
    }
    
    // 이전 분석 결과 초기화
    clearPreviousAnalysis();
    
    // 진행 정보 모달 표시
    showProgressModal();
    
    // 기간 설정 정보 확인
    let url = `/api/analyze/all?company=${encodeURIComponent(companyName)}`;
    if (currentPeriodSettings && currentPeriodSettings.isActive) {
        url += `&start_date=${currentPeriodSettings.startDate}&end_date=${currentPeriodSettings.endDate}`;
    }
    
    // AI 모델 설정 추가
    url += `&ai_model=${currentAiModel}`;
    
    // Temperature 설정 추가
    const settings = getSettings();
    const temperature = settings.temperature || 0.3;
    url += `&temperature=${temperature}`;
    
    // EventSource를 사용한 스트리밍 응답 처리
    const eventSource = new EventSource(url);
    currentEventSource = eventSource; // 전역 변수에 저장
    
    // 타임아웃 제거 - 무한대 설정 (긴 분석 작업을 위해)
    // 대신 사용자가 강제 종료할 수 있도록 함
    currentTimeout = null;
    
    // 연결 상태 추적
    let isConnected = false;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 3;
    
    eventSource.onopen = function(event) {
        console.log('EventSource connected');
        isConnected = true;
        reconnectAttempts = 0;
        
        // 연결 상태 표시
        const progressMessage = document.getElementById('progressMessage');
        if (progressMessage) {
            const messageText = progressMessage.querySelector('.message-text');
            if (messageText) {
                messageText.textContent = '서버와 연결되었습니다. 분석을 시작합니다...';
            }
        }
    };
    
    eventSource.onmessage = function(event) {
        try {
            console.log('[DEBUG] ===== EventSource 메시지 수신 =====');
            console.log('[DEBUG] 원본 이벤트 데이터:', event.data);
            
            const data = JSON.parse(event.data);
            console.log('[DEBUG] 파싱된 데이터 타입:', data.type);
            console.log('[DEBUG] 파싱된 데이터 전체:', data);
            
            switch (data.type) {
                case 'progress':
                    // 진행 상황 업데이트
                    console.log('[DEBUG] progress 케이스 진입');
                    updateProgressInfo(data);
                    break;
                    

                    
                case 'complete':
                    console.log('[DEBUG] ===== complete 케이스 진입 =====');
                    // 분석 완료
                    console.log('[DEBUG] ===== analyzeAll: 분석 완료 이벤트 수신 =====');
                    console.log('[DEBUG] 완료 데이터 전체:', JSON.stringify(data, null, 2));
                    console.log('[DEBUG] data.type:', data.type);
                    console.log('[DEBUG] data.data 존재:', !!data.data);
                    console.log('[DEBUG] data.result 존재:', !!data.result);
                    
                    if (currentTimeout) {
                        clearTimeout(currentTimeout);
                    }
                    eventSource.close();
                    currentEventSource = null;
                    currentTimeout = null;
                    console.log('[DEBUG] 분석 완료 데이터:', data);
                    
                    // 데이터 구조 확인 및 처리
                    let analysisData = null;
                    console.log('[DEBUG] 완료 데이터 구조:', data);
                    console.log('[DEBUG] data.data 타입:', typeof data.data);
                    console.log('[DEBUG] data.result 타입:', typeof data.result);
                    
                    if (data.data && typeof data.data === 'object') {
                        analysisData = data.data;
                        console.log('[DEBUG] data.data에서 분석 데이터 추출:', analysisData);
                    } else if (data.result && typeof data.result === 'object') {
                        analysisData = data.result;
                        console.log('[DEBUG] data.result에서 분석 데이터 추출:', analysisData);
                    } else {
                        console.error('[DEBUG] 분석 데이터를 찾을 수 없습니다:', data);
                        console.error('[DEBUG] data.data 값:', data.data);
                        console.error('[DEBUG] data.result 값:', data.result);
                    }
                    
                    if (analysisData && analysisData.company_name && analysisData.success) {
                        console.log('[DEBUG] ===== 분석 데이터 성공 =====');
                        console.log('[DEBUG] 회사명:', analysisData.company_name);
                        console.log('[DEBUG] 분석된 뉴스 수:', analysisData.analyzed_news ? analysisData.analyzed_news.length : 0);
                        console.log('[DEBUG] 종합의견 길이:', analysisData.comprehensive_opinion ? analysisData.comprehensive_opinion.length : 0);
                        
                        // 모달 닫기
                        console.log('[DEBUG] ===== 진행 모달 닫기 =====');
                        hideProgressModal();
                        console.log('[DEBUG] 진행 모달 닫기 완료');
                        
                        // AI 분석결과 자료실 목록 새로고침
                        if (typeof loadArchiveList === 'function') {
                            console.log('[DEBUG] AI 분석결과 자료실 목록 새로고침 시작');
                            loadArchiveList().then(() => {
                                console.log('[DEBUG] AI 분석결과 자료실 목록 새로고침 완료');
                            }).catch((refreshError) => {
                                console.error('[DEBUG] AI 분석결과 자료실 목록 새로고침 실패:', refreshError);
                            });
                        } else {
                            console.log('[DEBUG] loadArchiveList 함수가 없어서 AI 분석결과 자료실 새로고침 건너뜀');
                        }
                        
                        // 완료 모달 표시
                        console.log('[DEBUG] ===== 완료 모달 표시 시도 (analyzeAll) =====');
                        showCompletionModal(analysisData.company_name, analysisData.analyzed_news.length);
                        console.log('[DEBUG] ===== 완료 모달 표시 완료 (analyzeAll) =====');
                    } else {
                        console.log('[DEBUG] ===== 조건문 실패 - 데이터 검증 =====');
                        console.log('[DEBUG] analysisData 존재:', !!analysisData);
                        console.log('[DEBUG] company_name 존재:', !!(analysisData && analysisData.company_name));
                        console.log('[DEBUG] success 값:', analysisData && analysisData.success);
                        console.error('[DEBUG] 분석 데이터가 유효하지 않습니다:', data);
                        console.error('[DEBUG] data.data:', data.data);
                        console.error('[DEBUG] data.result:', data.result);
                        
                        const errorMessage = (data.data && data.data.message) || (data.result && data.result.message) || '분석 결과를 받을 수 없습니다.';
                        console.error('[DEBUG] 분석 오류:', errorMessage);
                        
                        // 모달 닫기
                        hideProgressModal();
                        
                        // 간단한 알림 표시
                        alert('AI 분석 중 오류가 발생했습니다.\n' + errorMessage);
                    }
                    break;
                    
                case 'error':
                    // 오류 발생
                    if (currentTimeout) {
                        clearTimeout(currentTimeout);
                    }
                    eventSource.close();
                    currentEventSource = null;
                    currentTimeout = null;
                    
                    // 모달 닫기
                    hideProgressModal();
                    
                    // 간단한 알림 표시
                    alert('AI 분석 중 오류가 발생했습니다.\n' + (data.message || '알 수 없는 오류'));
                    break;
            }
        } catch (error) {
            console.error('Event parsing error:', error);
        }
    };
    
    eventSource.onerror = function(error) {
        console.error('EventSource error:', error);
        if (currentTimeout) {
            clearTimeout(currentTimeout);
        }
        
        if (isConnected && reconnectAttempts < maxReconnectAttempts) {
            // 재연결 시도
            reconnectAttempts++;
            console.log(`EventSource 재연결 시도 ${reconnectAttempts}/${maxReconnectAttempts}`);
            
            // 사용자에게 재연결 시도 알림
            const progressMessage = document.getElementById('progressMessage');
            if (progressMessage) {
                const messageText = progressMessage.querySelector('.message-text');
                if (messageText) {
                    messageText.textContent = `연결이 끊어졌습니다. 재연결 시도 중... (${reconnectAttempts}/${maxReconnectAttempts})`;
                }
            }
            
            setTimeout(() => {
                eventSource.close();
                // 새로운 EventSource로 재연결
                const newEventSource = new EventSource(url);
                // 이벤트 리스너 재설정 (간단한 재연결)
                newEventSource.onmessage = eventSource.onmessage;
                newEventSource.onerror = eventSource.onerror;
                newEventSource.onopen = eventSource.onopen;
            }, 5000); // 5초 후 재연결
        } else {
            // 최대 재연결 시도 초과
            eventSource.close();
            currentEventSource = null;
            currentTimeout = null;
            hideProgressModal();
            showAnalysisErrorOnMain('스트리밍 연결이 끊어졌습니다. 다시 시도해주세요.');
        }
    };
}

// ==================== 완료 모달 관련 함수 ====================

function showCompletionModal(companyName, newsCount) {
    console.log('[DEBUG] showCompletionModal 호출됨');
    console.log('[DEBUG] 회사명:', companyName, '뉴스 수:', newsCount);
    
    const modal = document.getElementById('completionModal');
    const companyNameEl = document.getElementById('completionCompanyName');
    const newsCountEl = document.getElementById('completionNewsCount');
    
    if (!modal) {
        console.error('[DEBUG] completionModal 요소를 찾을 수 없습니다!');
        return;
    }
    
    // 정보 업데이트
    if (companyNameEl) companyNameEl.textContent = companyName;
    if (newsCountEl) newsCountEl.textContent = newsCount;
    
    // 모달 표시
    modal.classList.add('show');
    console.log('[DEBUG] 완료 모달 표시 완료');
}

function hideCompletionModal() {
    const modal = document.getElementById('completionModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

// 완료 모달 버튼 이벤트 리스너 (기존 DOMContentLoaded에 추가)
const btnGoToArchive = document.getElementById('btnGoToArchive');
const btnCloseCompletion = document.getElementById('btnCloseCompletion');

if (btnGoToArchive) {
    btnGoToArchive.addEventListener('click', function() {
        hideCompletionModal();
        // AI 분석결과 자료실 열기
        const archiveModal = document.getElementById('archiveModal');
        if (archiveModal) {
            archiveModal.classList.add('show');
            // 자료실 목록 새로고침
            if (typeof loadArchiveList === 'function') {
                loadArchiveList();
            }
        }
    });
}

if (btnCloseCompletion) {
    btnCloseCompletion.addEventListener('click', function() {
        hideCompletionModal();
    });
}

// 모달 외부 클릭 시 닫기
const completionModal = document.getElementById('completionModal');
if (completionModal) {
    completionModal.addEventListener('click', function(e) {
        if (e.target === completionModal) {
            hideCompletionModal();
        }
    });
}

function displayAllAnalysisOnMain(data) {
    try {
        console.log('[DEBUG] ===== displayAllAnalysisOnMain 시작 =====');
        console.log('[DEBUG] 전달받은 데이터:', data);
        console.log('[DEBUG] 데이터 타입:', typeof data);
        console.log('[DEBUG] 데이터 키들:', Object.keys(data || {}));
        
        // AI 분석 결과를 하단 영역에 표시
        const aiAnalysisContent = document.getElementById('aiAnalysisContent');
        console.log('[DEBUG] aiAnalysisContent 요소:', aiAnalysisContent);
        console.log('[DEBUG] aiAnalysisContent 존재 여부:', !!aiAnalysisContent);
        
        if (!aiAnalysisContent) {
            console.error('[DEBUG] aiAnalysisContent 요소를 찾을 수 없습니다!');
            throw new Error('aiAnalysisContent 요소를 찾을 수 없습니다');
        }
        
        // 기존 내용 완전 초기화
        const originalContent = aiAnalysisContent.innerHTML;
        console.log('[DEBUG] 기존 내용 길이:', originalContent.length);
        aiAnalysisContent.innerHTML = '';
        console.log('[DEBUG] aiAnalysisContent 초기화 완료');
        
        // 현재 분석 결과 저장
        currentAnalysisResult = data;
        console.log('[DEBUG] currentAnalysisResult 저장됨:', currentAnalysisResult);
    
        // 데이터 유효성 검사 강화
        console.log('[DEBUG] ===== 데이터 유효성 검사 시작 =====');
        const validationInfo = {
            hasData: !!data,
            hasCompanyName: !!(data && data.company_name),
            companyName: data ? data.company_name : 'undefined',
            hasAnalyzedNews: !!(data && data.analyzed_news),
            analyzedNewsLength: data && data.analyzed_news ? data.analyzed_news.length : 0,
            hasComprehensiveOpinion: !!(data && data.comprehensive_opinion),
            comprehensiveOpinionLength: data && data.comprehensive_opinion ? data.comprehensive_opinion.length : 0
        };
        console.log('[DEBUG] 유효성 검사 결과:', validationInfo);
        
        if (!data) {
            console.error('[DEBUG] 데이터 자체가 없습니다!');
            showAnalysisErrorOnMain('분석 데이터가 없습니다.');
            return;
        }
        
        if (!data.company_name) {
            console.error('[DEBUG] 회사명이 없습니다!');
            console.error('[DEBUG] 전체 데이터:', data);
            showAnalysisErrorOnMain('분석 데이터에 회사명이 없습니다.');
            return;
        }
        
        if (!data.analyzed_news || data.analyzed_news.length === 0) {
            console.error('[DEBUG] 분석된 뉴스가 없습니다!');
            showAnalysisErrorOnMain('분석된 뉴스가 없습니다.');
            return;
        }
        
        console.log('[DEBUG] ===== 데이터 유효성 검사 통과 =====');
        
        // 분석 버튼들 표시
        const analysisButtons = document.getElementById('analysisButtons');
        if (analysisButtons) {
            analysisButtons.style.display = 'flex';
            console.log('[DEBUG] 분석 버튼들 표시됨');
        }
        
        // 로딩 숨기기
        loading.style.display = 'none';
        console.log('[DEBUG] 로딩 숨김 완료');
        
        console.log('[DEBUG] ===== HTML 생성 시작 =====');
        console.log('[DEBUG] 회사명:', data.company_name);
        console.log('[DEBUG] 분석된 뉴스 수:', data.analyzed_news.length);
        console.log('[DEBUG] 종합의견 길이:', data.comprehensive_opinion ? data.comprehensive_opinion.length : 0);
        
        // 안전한 데이터 접근을 위한 헬퍼 함수
        const safeGet = (obj, path, defaultValue = '') => {
            try {
                return path.split('.').reduce((current, key) => current && current[key], obj) || defaultValue;
            } catch (e) {
                return defaultValue;
            }
        };
        
        // 안전한 HTML 이스케이프 함수
        const escapeHtml = (text) => {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        };
        
        // 종합의견 안전 처리
        const safeComprehensiveOpinion = safeGet(data, 'comprehensive_opinion', '종합의견을 생성하는 중입니다...');
        const formattedOpinion = formatComprehensiveOpinion(safeComprehensiveOpinion);
        console.log('[DEBUG] 종합의견 처리 완료:', formattedOpinion ? '있음' : '없음');
        
        let html = `<div class="analyze-section">
            <div class="analyze-header">
                <h4>1. ${escapeHtml(data.company_name)} 종합 분석 결과</h4>
            </div>
            
            <div style="height: 8px; margin: 5px 0; display: block; clear: both; background: transparent; border: none; padding: 0;"></div>
            
            <div class="analysis-summary">
                <div class="summary-item">
                    <h4>* 분석 총평</h4>
                    <div class="comprehensive-opinion" style="background: #ffffff !important; border: 3px solid #e9ecef !important; border-radius: 12px !important; padding: 30px !important; margin: 20px 0 !important; line-height: 1.8 !important; color: #202124 !important; font-size: 15px !important; box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important; position: relative !important; display: block !important; min-height: 100px !important; overflow: hidden !important;">
                        <div style="content: ''; position: absolute; top: 0; left: 0; right: 0; height: 6px; background: linear-gradient(90deg, #4285f4, #34a853); border-radius: 12px 12px 0 0; z-index: 1;"></div>
                        ${formattedOpinion}
                    </div>
                    <div style="height: 2px; margin: 1px 0; display: block; clear: both; background: transparent; border: none; padding: 0;"></div>
                </div>
                
                <div style="height: 5px; margin: 3px 0; display: block; clear: both; background: transparent; border: none; padding: 0;"></div>
                
                <div class="chart-section">
                    <h4>* 주간 동향분석 점수 변화</h4>
                    <div class="chart-container">
                        <canvas id="sentimentChart" width="800" height="200"></canvas>
                    </div>
                    <div style="height: 5px; margin: 3px 0; display: block; clear: both; background: transparent; border: none; padding: 0;"></div>
                </div>
            </div>`;
        
        console.log('[DEBUG] 기본 HTML 생성 완료');
        
        // 뉴스별 분석 결과 표시 (안전한 처리)
        if (data.analyzed_news && data.analyzed_news.length > 0) {
            html += `<div style="height: 5px; margin: 3px 0; display: block; clear: both; background: transparent; border: none; padding: 0;"></div>
            <div class="news-analysis-section">
                <h4>2. 뉴스별 분석 결과</h4>
                <div style="height: 5px; margin: 3px 0; display: block; clear: both; background: transparent; border: none; padding: 0;"></div>`;
            
            console.log('[DEBUG] 뉴스 분석 데이터 처리 시작, 총 뉴스 수:', data.analyzed_news.length);
            
            // 뉴스 수를 제한하여 메모리 문제 방지
            const maxNewsToDisplay = 100; // 최대 100개 뉴스만 표시
            const newsToDisplay = data.analyzed_news.slice(0, maxNewsToDisplay);
            
            if (data.analyzed_news.length > maxNewsToDisplay) {
                console.log(`[DEBUG] 뉴스가 ${data.analyzed_news.length}개이므로 ${maxNewsToDisplay}개만 표시합니다.`);
            }
            
            let processedNewsCount = 0;
            newsToDisplay.forEach((news, index) => {
                try {
                    console.log(`[DEBUG] 뉴스 ${index + 1} 처리 시작:`, news);
                    
                    // 안전한 데이터 추출
                    const newsInfo = safeGet(news, 'news_info', {});
                    const trendAnalysis = safeGet(news, 'trend_analysis', {});
                    const awardAnalysis = safeGet(news, 'award_analysis', {});
                    const investmentAnalysis = safeGet(news, 'investment_analysis', {});
                    
                    console.log(`[DEBUG] 뉴스 ${index + 1} 분석 데이터:`, {
                        newsInfo: !!newsInfo,
                        trendAnalysis: !!trendAnalysis,
                        awardAnalysis: !!awardAnalysis,
                        investmentAnalysis: !!investmentAnalysis
                    });
                    
                    // 안전한 링크 처리
                    const newsTitle = safeGet(newsInfo, 'title', '제목 없음');
                    const newsLink = safeGet(newsInfo, 'link', '');
                    const newsLinkHtml = newsLink ? `<a href="${escapeHtml(newsLink)}" target="_blank" class="news-link">${escapeHtml(newsTitle)}</a>` : escapeHtml(newsTitle);
                    
                    // 안전한 분석 데이터 추출
                    const sentimentScore = safeGet(trendAnalysis, 'sentiment_score', 0);
                    const sentimentLabel = safeGet(trendAnalysis, 'sentiment_label', '중립');
                    const newsTrendSummary = safeGet(trendAnalysis, 'news_trend_summary', '분석 내용이 없습니다.');
                    
                    const isAwardRelated = safeGet(awardAnalysis, 'is_award_related', 'N');
                    const awardName = safeGet(awardAnalysis, 'award_name', '');
                    const awardReason = safeGet(awardAnalysis, 'award_reason', '분석 내용이 없습니다.');
                    
                    const isInvestmentRelated = safeGet(investmentAnalysis, 'is_investment_related', 'N');
                    const investmentName = safeGet(investmentAnalysis, 'investment_name', '');
                    const investmentReason = safeGet(investmentAnalysis, 'investment_reason', '분석 내용이 없습니다.');
                    
                    html += `
                        <div class="analyze-news-item">
                            <div class="analyze-news-header">
                                <h4>* 뉴스 ${index + 1} : ${escapeHtml(newsTitle)}</h4>
                            </div>
                            
                            <div class="news-info-section">
                                <div class="news-info-content">
                                    <p><strong>제목:</strong> ${newsLinkHtml}</p>
                                    <p><strong>내용:</strong> ${escapeHtml(safeGet(newsInfo, 'description', '내용이 없습니다.'))}</p>
                                    <p><strong>출처:</strong> ${escapeHtml(safeGet(newsInfo, 'source', '출처 없음'))}, <strong>시간:</strong> ${formatDate(safeGet(newsInfo, 'published', ''))}</p>
                                </div>
                            </div>
                            
                            <div class="analyze-results-grid">
                                <!-- 동향분석 -->
                                <div class="analyze-result-card trend-analysis">
                                    <div class="analyze-card-header">
                                        <i class="fas fa-chart-area"></i>
                                        <span>동향분석</span>
                                    </div>
                                    <div class="analyze-card-content">
                                        <div class="analyze-field">
                                            <label>긍정/부정 점수:</label>
                                            <div class="analyze-value">
                                                <span class="sentiment-score ${getSentimentClass(sentimentScore)}">
                                                    ${sentimentScore}
                                                </span>
                                                <span class="sentiment-label">${escapeHtml(sentimentLabel)}</span>
                                            </div>
                                        </div>
                                        <div class="analyze-field">
                                            <label>뉴스 동향 요약:</label>
                                            <div class="analyze-value">${escapeHtml(newsTrendSummary)}</div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- 수상실적분석 -->
                                <div class="analyze-result-card award-analysis">
                                    <div class="analyze-card-header">
                                        <i class="fas fa-trophy"></i>
                                        <span>수상실적분석</span>
                                    </div>
                                    <div class="analyze-card-content">
                                        <div class="analyze-field">
                                            <label>수상실적 여부:</label>
                                            <div class="analyze-value">
                                                <span class="status-badge ${isAwardRelated === 'Y' ? 'yes' : 'no'}">
                                                    ${isAwardRelated === 'Y' ? 'Y' : 'N'}
                                                </span>
                                            </div>
                                        </div>
                                        ${isAwardRelated === 'Y' ? `
                                        <div class="analyze-field">
                                            <label>수상실적명:</label>
                                            <div class="analyze-value">${escapeHtml(awardName || '수상명 정보 없음')}</div>
                                        </div>
                                        ` : ''}
                                        <div class="analyze-field">
                                            <label>수상실적 여부 이유:</label>
                                            <div class="analyze-value">${escapeHtml(awardReason)}</div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- 투자실적분석 -->
                                <div class="analyze-result-card investment-analysis">
                                    <div class="analyze-card-header">
                                        <i class="fas fa-chart-line"></i>
                                        <span>투자실적분석</span>
                                    </div>
                                    <div class="analyze-card-content">
                                        <div class="analyze-field">
                                            <label>투자실적 여부:</label>
                                            <div class="analyze-value">
                                                <span class="status-badge ${isInvestmentRelated === 'Y' ? 'yes' : 'no'}">
                                                    ${isInvestmentRelated === 'Y' ? 'Y' : 'N'}
                                                </span>
                                            </div>
                                        </div>
                                        ${isInvestmentRelated === 'Y' ? `
                                        <div class="analyze-field">
                                            <label>투자실적명:</label>
                                            <div class="analyze-value">${escapeHtml(investmentName || '투자명 정보 없음')}</div>
                                        </div>
                                        ` : ''}
                                        <div class="analyze-field">
                                            <label>투자실적 여부 이유:</label>
                                            <div class="analyze-value">${escapeHtml(investmentReason)}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div style="height: 10px; margin: 8px 0; display: block; clear: both; background: transparent; border: none; padding: 0;"></div>
                    `;
                    processedNewsCount++;
                } catch (newsError) {
                    console.error(`[DEBUG] 뉴스 ${index + 1} 처리 중 오류:`, newsError);
                    // 개별 뉴스 오류 시에도 계속 진행
                    html += `
                        <div class="analyze-news-item">
                            <div class="analyze-news-header">
                                <h4>* 뉴스 ${index + 1} : 처리 오류</h4>
                            </div>
                            <div class="analyze-card-content">
                                <p>뉴스 처리 중 오류가 발생했습니다: ${escapeHtml(newsError.message)}</p>
                            </div>
                        </div>
                    `;
                }
            });
            
            console.log(`[DEBUG] 뉴스 처리 완료: ${processedNewsCount}개 처리됨`);
            
            if (data.analyzed_news.length > maxNewsToDisplay) {
                html += `
                    <div class="analyze-news-item">
                        <div class="analyze-news-header">
                            <h4>* 추가 뉴스</h4>
                        </div>
                        <div class="analyze-card-content">
                            <p>성능상의 이유로 ${maxNewsToDisplay}개 뉴스만 표시됩니다. (총 ${data.analyzed_news.length}개)</p>
                        </div>
                    </div>
                `;
            }
            
            html += `</div>`;
        }
        
        html += '</div>';
        
        console.log('[DEBUG] ===== HTML 생성 완료 =====');
        console.log('[DEBUG] 생성된 HTML 길이:', html.length);
        console.log('[DEBUG] HTML 미리보기:', html.substring(0, 300) + '...');
        
        // AI 분석 결과를 하단 영역에 표시 (안전한 처리)
        try {
            console.log('[DEBUG] ===== DOM에 HTML 추가 시작 =====');
            aiAnalysisContent.innerHTML = html;
            console.log('[DEBUG] HTML이 DOM에 추가됨');
            
            // 즉시 결과 확인
            const resultElements = aiAnalysisContent.querySelectorAll('.analyze-section, .analyze-news-item');
            console.log('[DEBUG] 즉시 확인 - 표시된 결과 요소 수:', resultElements.length);
            console.log('[DEBUG] 즉시 확인 - aiAnalysisContent 내용 길이:', aiAnalysisContent.innerHTML.length);
            
            // 분석 결과 영역이 보이도록 스크롤
            aiAnalysisContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
            console.log('[DEBUG] 분석 결과 영역으로 스크롤됨');
            
            // 추가 확인 (100ms 후)
            setTimeout(() => {
                const resultElements2 = aiAnalysisContent.querySelectorAll('.analyze-section, .analyze-news-item');
                console.log('[DEBUG] 100ms 후 확인 - 표시된 결과 요소 수:', resultElements2.length);
                
                if (resultElements2.length === 0) {
                    console.error('[DEBUG] 결과 요소가 표시되지 않았습니다! 강제 재표시 시도');
                    // 강제로 다시 표시 시도
                    aiAnalysisContent.innerHTML = html;
                    console.log('[DEBUG] 강제 재표시 완료');
                    
                    // 재표시 후 다시 확인
                    setTimeout(() => {
                        const resultElements3 = aiAnalysisContent.querySelectorAll('.analyze-section, .analyze-news-item');
                        console.log('[DEBUG] 재표시 후 확인 - 표시된 결과 요소 수:', resultElements3.length);
                    }, 50);
                }
            }, 100);
            
            console.log('[DEBUG] ===== DOM에 HTML 추가 완료 =====');
            
        } catch (error) {
            console.error('[DEBUG] HTML 추가 중 오류:', error);
            console.error('[DEBUG] 오류 스택:', error.stack);
            // 오류 발생 시 간단한 메시지라도 표시
            aiAnalysisContent.innerHTML = `
                <div class="analyze-section">
                    <div class="analyze-header">
                        <h4>${escapeHtml(data.company_name)} 분석 결과</h4>
                    </div>
                    <div class="analysis-summary">
                        <p>분석이 완료되었습니다. 결과를 표시하는 중 오류가 발생했습니다.</p>
                        <p>오류: ${escapeHtml(error.message)}</p>
                        <p>오류 타입: ${escapeHtml(error.name)}</p>
                    </div>
                </div>
            `;
        }
        
        // 동향분석 점수 변화 그래프 생성 (안전한 처리)
        console.log('[DEBUG] ===== 차트 생성 시작 =====');
        try {
            createSentimentChart(data.analyzed_news);
            console.log('[DEBUG] 차트 생성 완료');
        } catch (error) {
            console.error('[DEBUG] 차트 생성 중 오류:', error);
        }
        
        console.log('[DEBUG] ===== displayAllAnalysisOnMain 완료 =====');
        
    } catch (error) {
        console.error('[DEBUG] displayAllAnalysisOnMain 전체 오류:', error);
        console.error('[DEBUG] 오류 스택:', error.stack);
        showAnalysisErrorOnMain(`결과 표시 중 오류가 발생했습니다: ${error.message}`);
    }
}

function showAnalysisErrorOnMain(message) {
    // 기존 뉴스 그리드 숨기기
    newsGrid.style.display = 'none';
    noResults.style.display = 'none';
    // 초기 메시지 제거됨
    loading.style.display = 'none';
    
    // AI 분석 결과를 하단 영역에 표시
    const aiAnalysisContent = document.getElementById('aiAnalysisContent');
    
    // AI 분석 영역에 오류 메시지 표시
    aiAnalysisContent.innerHTML = `
        <div class="analyze-error">
            <div class="error-icon">
                <i class="fas fa-exclamation-triangle"></i>
            </div>
            <div class="error-content">
                <h4>분석 오류</h4>
                <p>${message}</p>
                <div class="error-suggestions">
                    <p><strong>해결 방법:</strong></p>
                    <ul>
                        <li>잠시 후 다시 시도해주세요</li>
                        <li>다른 검색어로 시도해보세요</li>
                        <li>네트워크 연결을 확인해주세요</li>
                    </ul>
                </div>
                <button class="btn btn-primary" onclick="clearAnalysisResults()">다시 시도</button>
            </div>
        </div>
    `;
}

function createSentimentChart(analyzedNews) {
    // 뉴스 데이터를 날짜별로 그룹화
    const weeklyData = {};
    
    analyzedNews.forEach(news => {
        const date = new Date(news.news_info.published);
        const weekKey = `${date.getFullYear()}-W${Math.ceil((date.getDate() + new Date(date.getFullYear(), date.getMonth(), 1).getDay()) / 7)}`;
        
        if (!weeklyData[weekKey]) {
            weeklyData[weekKey] = [];
        }
        weeklyData[weekKey].push(news.trend_analysis.sentiment_score);
    });
    
    // 주별 평균 점수 계산
    const labels = Object.keys(weeklyData).sort();
    const data = labels.map(week => {
        const scores = weeklyData[week];
        return scores.reduce((sum, score) => sum + score, 0) / scores.length;
    });
    
    // Chart.js 설정
    const ctx = document.getElementById('sentimentChart');
    if (ctx) {
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: '동향분석 점수',
                    data: data,
                    borderColor: '#4299e1',
                    backgroundColor: 'rgba(66, 153, 225, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 5,
                        min: -5,
                        ticks: {
                            stepSize: 2
                        }
                    },
                    x: {
                        ticks: {
                            maxRotation: 45
                        }
                    }
                }
            }
        });
    }
}

function clearAnalysisResults() {
    // AI 분석 결과 초기화
    const aiAnalysisContent = document.getElementById('aiAnalysisContent');
    aiAnalysisContent.innerHTML = `
        <div class="no-analysis-message">
            <i class="fas fa-info-circle"></i>
            <p>아직 분석 결과가 없습니다.</p>
            <p class="analysis-guide">뉴스 검색 후 'AI 분석' 버튼을 클릭하여 분석을 시작하세요.</p>
        </div>
    `;
    
    // 분석 버튼들 숨기기
    const analysisButtons = document.getElementById('analysisButtons');
    if (analysisButtons) {
        analysisButtons.style.display = 'none';
    }
    
    // 현재 분석 결과 초기화
    currentAnalysisResult = null;
}

function displayAnalyzeError(message) {
    const content = document.getElementById('analyzeContent');
    content.innerHTML = `
        <div class="analyze-error">
            <i class="fas fa-exclamation-triangle"></i>
            <p>${message}</p>
        </div>
    `;
}

// 진행 정보 모달 관리 함수들
function showProgressModal() {
    const progressModal = document.getElementById('progressModal');
    const forceStopBtn = document.getElementById('forceStopBtn');
    const excelSaveMessage = document.getElementById('excelSaveMessage');
    
    progressModal.style.display = 'flex';
    progressModal.style.alignItems = 'center';
    progressModal.style.justifyContent = 'center';
    
    // 강제 종료 버튼 표시
    if (forceStopBtn) {
        forceStopBtn.style.display = 'inline-block';
        forceStopBtn.onclick = forceStopAnalysis;
    }
    
    // 엑셀 저장 완료 메시지 숨기기 (새로운 분석 시작 시)
    if (excelSaveMessage) {
        excelSaveMessage.style.display = 'none';
    }
    
    // 초기 진행 정보 설정
    updateProgressInfo({
        company_name: '',
        total_news: 0,
        current_news: 0,
        current_step: '',
        message: '분석을 시작합니다...'
    });
}

function hideProgressModal() {
    const progressModal = document.getElementById('progressModal');
    const forceStopBtn = document.getElementById('forceStopBtn');
    const excelSaveMessage = document.getElementById('excelSaveMessage');
    
    progressModal.style.display = 'none';
    
    // 강제 종료 버튼 숨기기
    if (forceStopBtn) {
        forceStopBtn.style.display = 'none';
    }
    
    // 엑셀 저장 완료 메시지 숨기기
    if (excelSaveMessage) {
        excelSaveMessage.style.display = 'none';
    }
}

function getStepIndex(step) {
    switch (step) {
        case 'trend': return 0;
        case 'award': return 1;
        case 'investment': return 2;
        default: return 0;
    }
}

function formatComprehensiveOpinion(opinion) {
    if (!opinion) return '';
    // 백엔드에서 이미 올바른 포맷으로 전송되므로 그대로 반환
    return opinion.replace(/\n/g, '<br>');
}

function updateProgressInfo(progressInfo) {
    console.log('[DEBUG] updateProgressInfo 호출됨:', progressInfo);
    
    const progressMessage = document.getElementById('progressMessage');
    const progressCompany = document.getElementById('progressCompany');
    const progressTotalNews = document.getElementById('progressTotalNews');
    const progressCurrentNews = document.getElementById('progressCurrentNews');
    const progressStepText = document.getElementById('progressStepText');
    const progressStepName = document.getElementById('progressStepName');
    const progressBar = document.getElementById('progressBar');
    
    if (progressMessage) {
        const messageText = progressMessage.querySelector('.message-text');
        const messageSpinner = progressMessage.querySelector('.message-spinner');
        if (messageText) {
            messageText.textContent = progressInfo.message || '분석 중...';
        }
        // 스피너가 텍스트 다음에 오도록 순서 조정
        if (messageSpinner && messageText) {
            messageText.parentNode.insertBefore(messageText, messageSpinner);
        }
    }
    if (progressCompany) progressCompany.textContent = progressInfo.company_name || '-';
    if (progressTotalNews) progressTotalNews.textContent = progressInfo.total_news || '-';
    
    // 배치 정보 표시 (새로운 배치 처리 방식)
    if (progressInfo.current_batch && progressInfo.total_batches) {
        if (progressCurrentNews) {
            if (progressInfo.current_news) {
                const companyName = progressInfo.company_name || '기업';
                const totalNews = progressInfo.total_news || 0;
                const currentNews = progressInfo.current_news;
                const currentBatch = progressInfo.current_batch;
                const totalBatches = progressInfo.total_batches;
                
                // 현재 뉴스 번호를 명확하게 표시
                progressCurrentNews.textContent = `뉴스 ${currentNews}/${totalNews} 분석 중 (배치 ${currentBatch}/${totalBatches})`;
            } else {
                progressCurrentNews.textContent = `배치 ${progressInfo.current_batch}/${progressInfo.total_batches}`;
            }
        }
    } else {
        if (progressCurrentNews) {
            const companyName = progressInfo.company_name || '기업';
            if (progressInfo.current_news) {
                const totalNews = progressInfo.total_news || 0;
                const currentNews = progressInfo.current_news;
                progressCurrentNews.textContent = `뉴스 ${currentNews}/${totalNews} 분석 중`;
            } else {
                progressCurrentNews.textContent = progressInfo.current_news || '-';
            }
        }
    }
    
    // 분석 단계 텍스트 변환 (배치 처리 방식에 맞게 수정)
    let stepText = '준비 중...';
    let stepName = '-';
    
    console.log('[DEBUG] current_step 확인:', progressInfo.current_step);
    
    // 배치 처리 방식에서는 각 뉴스마다 3단계(동향, 수상실적, 투자실적) 분석
    if (progressInfo.current_step) {
        if (progressInfo.current_step.includes('배치 분석 시작')) {
            stepText = '배치 분석 시작';
            stepName = '배치 시작';
        } else if (progressInfo.current_step.includes('개별 뉴스 분석')) {
            stepText = 'AI 뉴스 분석 중';
            stepName = 'AI 뉴스 분석';
        } else if (progressInfo.current_step.includes('뉴스 분석')) {
            stepText = 'AI 뉴스 분석 중';
            stepName = 'AI 뉴스 분석';
        } else if (progressInfo.current_step.includes('배치 완료')) {
            stepText = '배치 완료';
            stepName = '배치 완료';
        } else if (progressInfo.current_step.includes('종합의견')) {
            stepText = '종합의견 생성 중';
            stepName = '종합의견 생성';
        } else if (progressInfo.current_step.includes('분석 완료')) {
            stepText = '분석 완료';
            stepName = '분석 완료';
        } else if (progressInfo.current_step.includes('엑셀 저장')) {
            stepText = '엑셀 저장 중';
            stepName = '엑셀 저장';
        } else {
            stepText = progressInfo.current_step;
            stepName = progressInfo.current_step;
        }
    }
    
    console.log('[DEBUG] 변환된 stepText:', stepText);
    console.log('[DEBUG] 변환된 stepName:', stepName);
    
    if (progressStepText) progressStepText.textContent = stepText;
    if (progressStepName) progressStepName.textContent = stepName;
    
    // 진행률 업데이트 (백엔드에서 전송된 progress 사용)
    let progressPercent = 0;
    if (progressInfo.progress !== undefined) {
        progressPercent = Math.round(progressInfo.progress);
    }
    
    // 진행률을 0-100 범위로 제한
    progressPercent = Math.max(0, Math.min(100, progressPercent));
    
    // 진행바 업데이트
    if (progressBar) {
        progressBar.style.width = `${progressPercent}%`;
        // 진행률에 따른 색상 변화
        if (progressPercent < 30) {
            progressBar.style.background = 'linear-gradient(90deg, #007bff, #0056b3)';
        } else if (progressPercent < 70) {
            progressBar.style.background = 'linear-gradient(90deg, #007bff, #0056b3)';
        } else {
            progressBar.style.background = 'linear-gradient(90deg, #007bff, #0056b3)';
        }
    }
    
    // 분석 완료 시 모달 자동 닫기
    if (progressInfo.current_step && progressInfo.current_step.includes('분석 완료')) {
        setTimeout(() => {
            hideProgressModal();
        }, 2000); // 2초 후 모달 닫기
    }
}



function getSentimentClass(score) {
    if (score >= 4) return 'very-positive';
    if (score >= 1) return 'positive';
    if (score >= -1) return 'neutral';
    if (score >= -4) return 'negative';
    return 'very-negative';
}

function showAnalysisError(message) {
    // 분석 모달을 열고 오류 메시지 표시
    showAnalyzeModal();
    const content = document.getElementById('analyzeContent');
    content.innerHTML = `
        <div class="analyze-error">
            <div class="error-icon">
                <i class="fas fa-exclamation-triangle"></i>
            </div>
            <div class="error-content">
                <h4>분석 오류</h4>
                <p>${message}</p>
                <div class="error-suggestions">
                    <p><strong>해결 방법:</strong></p>
                    <ul>
                        <li>잠시 후 다시 시도해주세요</li>
                        <li>다른 검색어로 시도해보세요</li>
                        <li>네트워크 연결을 확인해주세요</li>
                    </ul>
                </div>
                <button class="btn btn-primary" onclick="hideAnalyzeModal()">닫기</button>
            </div>
        </div>
    `;
}

function simulateProgressUpdates(companyName) {
    // 실제 뉴스 개수를 가져오기 위해 서버에 요청
            let url = `/api/search?q=${encodeURIComponent(companyName)}`;
        if (currentPeriodSettings && currentPeriodSettings.isActive) {
            url = `/api/search/period?q=${encodeURIComponent(companyName)}&start_date=${currentPeriodSettings.startDate}&end_date=${currentPeriodSettings.endDate}`;
    }
    
    // 초기 메시지
    updateProgressInfo({
        company_name: companyName,
        total_news: 0,
        current_news: 0,
        current_step: '',
        message: `${companyName} 기업관련 뉴스를 수집하고 있습니다...`
    });
    
    // 실제 뉴스 개수 확인
    fetch(url)
        .then(response => response.json())
        .then(data => {
            const actualNewsCount = data.results ? data.results.length : 0;
            const maxNewsCount = Math.min(actualNewsCount, 20); // 최대 20개로 제한
            
            // 뉴스 수집 완료 시뮬레이션
            setTimeout(() => {
                updateProgressInfo({
                    company_name: companyName,
                    total_news: maxNewsCount,
                    current_news: 0,
                    current_step: '',
                    message: `${companyName} 기업관련 뉴스를 ${maxNewsCount}건 발견했습니다.`
                });
            }, 1000);
            
            // 각 뉴스별 분석 시뮬레이션
            for (let i = 1; i <= maxNewsCount; i++) {
                setTimeout(() => {
                    // 뉴스 분석 시작
                    updateProgressInfo({
                        company_name: companyName,
                        total_news: maxNewsCount,
                        current_news: i,
                        current_step: '',
                        message: `${companyName}에 대한 ${i}번째 뉴스를 분석하고 있습니다.`
                    });
                }, 2000 + (i - 1) * 2000);
                
                setTimeout(() => {
                    // 동향 분석
                    updateProgressInfo({
                        company_name: companyName,
                        total_news: maxNewsCount,
                        current_news: i,
                        current_step: 'trend',
                        message: `${companyName}에 대한 ${i}번째 뉴스의 동향 분석을 하고 있습니다.`
                    });
                }, 2500 + (i - 1) * 2000);
                
                setTimeout(() => {
                    // 수상실적 분석
                    updateProgressInfo({
                        company_name: companyName,
                        total_news: maxNewsCount,
                        current_news: i,
                        current_step: 'award',
                        message: `${companyName}에 대한 ${i}번째 뉴스의 수상실적 분석을 하고 있습니다.`
                    });
                }, 3000 + (i - 1) * 2000);
                
                setTimeout(() => {
                    // 투자실적 분석
                    updateProgressInfo({
                        company_name: companyName,
                        total_news: maxNewsCount,
                        current_news: i,
                        current_step: 'investment',
                        message: `${companyName}에 대한 ${i}번째 뉴스의 투자실적 분석을 하고 있습니다.`
                    });
                }, 3500 + (i - 1) * 2000);
            }
        })
        .catch(error => {
            console.error('Error fetching news count:', error);
            // 오류 발생 시 기본값 사용
            const defaultNewsCount = 5;
            
            setTimeout(() => {
                updateProgressInfo({
                    company_name: companyName,
                    total_news: defaultNewsCount,
                    current_news: 0,
                    current_step: '',
                    message: `${companyName} 기업관련 뉴스를 ${defaultNewsCount}건 발견했습니다.`
                });
            }, 1000);
            
            // 기본 뉴스 개수로 시뮬레이션
            for (let i = 1; i <= defaultNewsCount; i++) {
                setTimeout(() => {
                    updateProgressInfo({
                        company_name: companyName,
                        total_news: defaultNewsCount,
                        current_news: i,
                        current_step: '',
                        message: `${companyName}에 대한 ${i}번째 뉴스를 분석하고 있습니다.`
                    });
                }, 2000 + (i - 1) * 2000);
            }
        });
}

// 뉴스 검색 결과 모달 숨기기
function hideNewsResultsModal() {
    const modal = document.getElementById('newsResultsModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('show');
        
        // 모달 내부 요소들 초기화
        const startAnalysisBtn = document.getElementById('startAnalysisBtn');
        const closeNewsResultsBtn = document.getElementById('closeNewsResultsBtn');
        const closeNewsResultsModal = document.getElementById('closeNewsResultsModal');
        
        // 이벤트 리스너 제거
        if (startAnalysisBtn) {
            startAnalysisBtn.onclick = null;
        }
        if (closeNewsResultsBtn) {
            closeNewsResultsBtn.onclick = null;
        }
        if (closeNewsResultsModal) {
            closeNewsResultsModal.onclick = null;
        }
        
        console.log('[DEBUG] 뉴스 검색 결과 모달이 완전히 닫혔습니다.');
    }
}

// 엑셀 다운로드 함수
function downloadExcel(searchData) {
    try {
        console.log('[DEBUG] 엑셀 다운로드 시작:', searchData);
        
        // 버튼 상태 변경 (로딩 표시)
        const excelBtn = document.getElementById('excelDownloadBtn');
        const originalText = excelBtn.innerHTML;
        excelBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 생성 중...';
        excelBtn.disabled = true;
        
        // 검색 결과 데이터 준비
        const newsItems = searchData.results || [];
        if (!newsItems || newsItems.length === 0) {
            alert('다운로드할 뉴스 데이터가 없습니다.');
            excelBtn.innerHTML = originalText;
            excelBtn.disabled = false;
            return;
        }
        
        // POST 요청으로 데이터 전송하여 엑셀 생성
        // 전체 본문은 이미 뉴스 검색 시 가져왔으므로 별도 옵션 불필요
        const requestData = {
            query: searchInput.value.trim(),
            results: newsItems,
            total_before_dedup: searchData.total_before_dedup || newsItems.length,
            total_after_dedup: searchData.total_after_dedup || newsItems.length,
            duplicates_removed: searchData.duplicates_removed || 0
        };
        
        fetch('/api/search/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.blob();
        })
        .then(blob => {
            // 파일명 생성
            const now = new Date();
            const timestamp = now.getFullYear() + 
                             String(now.getMonth() + 1).padStart(2, '0') + 
                             String(now.getDate()).padStart(2, '0') + '_' +
                             String(now.getHours()).padStart(2, '0') + 
                             String(now.getMinutes()).padStart(2, '0');
            
            const query = searchInput.value.trim();
            const companyName = query.replace(/[^가-힣a-zA-Z0-9]/g, '').substring(0, 20) || '검색결과';
            const filename = `${companyName}_뉴스검색결과_${timestamp}.xlsx`;
            
            // 파일 다운로드
            const downloadUrl = window.URL.createObjectURL(blob);
            const downloadLink = document.createElement('a');
            downloadLink.href = downloadUrl;
            downloadLink.download = filename;
            downloadLink.style.display = 'none';
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            window.URL.revokeObjectURL(downloadUrl);
            
            console.log('[DEBUG] 엑셀 다운로드 완료:', filename);
        })
        .catch(error => {
            console.error('[ERROR] 엑셀 다운로드 중 오류:', error);
            alert('엑셀 파일 다운로드 중 오류가 발생했습니다: ' + error.message);
        })
        .finally(() => {
            // 버튼 상태 복원
            setTimeout(() => {
                excelBtn.innerHTML = originalText;
                excelBtn.disabled = false;
            }, 1000);
        });
        
    } catch (error) {
        console.error('[ERROR] 엑셀 다운로드 중 오류:', error);
        
        // 버튼 상태 복원
        const excelBtn = document.getElementById('excelDownloadBtn');
        if (excelBtn) {
            excelBtn.innerHTML = '<i class="fas fa-file-excel"></i> 엑셀 다운로드';
            excelBtn.disabled = false;
        }
        
        alert('엑셀 파일 다운로드 중 오류가 발생했습니다.');
    }
} // ==================== 다수 기업 검색 기능 ====================

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
    
    // 버튼 상태 초기화
    startMultiSearchBtn.disabled = false;
    startMultiSearchBtn.innerHTML = '<i class="fas fa-search"></i> 기사 조회 시작';
    startMultiSearchBtn.className = 'btn btn-primary';
    delete startMultiSearchBtn.dataset.zipFilename;
    
    // 진행 상태 숨기기
    const progressSection = document.getElementById('multiProgressSection');
    if (progressSection) {
        progressSection.style.display = 'none';
    }
    
    // 모달 표시
    multiCompanyModal.classList.add('show');
}

// 다수 기업 검색 모달 숨기기
function hideMultiCompanyModal() {
    // 진행 중인 검색이 있으면 취소
    if (multiSearchAbortController) {
        console.log('[INFO] 모달 닫기: 진행 중인 검색 취소');
        multiSearchAbortController.abort();
        multiSearchAbortController = null;
    }
    
    multiCompanyModal.classList.remove('show');
    
    // 진행 상태 초기화
    const progressSection = document.getElementById('multiProgressSection');
    if (progressSection) {
        progressSection.style.display = 'none';
    }
    
    // 버튼 상태 초기화
    if (startMultiSearchBtn) {
        startMultiSearchBtn.disabled = false;
        startMultiSearchBtn.innerHTML = '<i class="fas fa-search"></i> 기사 조회 시작';
        startMultiSearchBtn.className = 'btn btn-primary';
        delete startMultiSearchBtn.dataset.zipFilename;
    }
}

// 기업 리스트 로드
function loadCompanyListForMulti() {
    console.log('[DEBUG] 다수 기업 검색용 기업 리스트 로드');
    
    if (!companyListForMulti) {
        console.error('[ERROR] companyListForMulti 요소를 찾을 수 없습니다');
        return;
    }
    
    // companyData 사용 (DB에서 로드된 모든 연도의 기업 목록)
    if (!companyData || companyData.length === 0) {
        companyListForMulti.innerHTML = '<p style="padding: 20px; text-align: center; color: #999;">기업 목록을 불러올 수 없습니다.</p>';
        return;
    }
    
    // 연도별로 그룹화 (동적으로 모든 연도 처리)
    const years = [...new Set(companyData.map(c => c.year))].sort((a, b) => a - b);
    console.log('[DEBUG] 다수 기업 검색 - 연도 목록:', years);
    
    let html = '';
    
    // 각 연도별로 기업 목록 생성
    years.forEach(year => {
        const companiesForYear = companyData.filter(c => c.year === year);
        
        if (companiesForYear.length > 0) {
            html += '<div class="company-year-group">';
            html += `
                <div class="company-year-header">
                    <div class="company-year-label">${year}년</div>
                    <label class="year-select-all">
                        <input type="checkbox" class="year-checkbox" data-year="${year}" checked>
                        <span>전체 선택</span>
                    </label>
                </div>
            `;
            html += '<div class="company-year-group-items">';
            html += companiesForYear.map((company, index) => {
                return `
                    <div class="company-item">
                        <input type="checkbox" class="company-checkbox year-${year}" id="company_${year}_${index}" value="${company.name}" checked>
                        <label for="company_${year}_${index}">${company.name}</label>
                    </div>
                `;
            }).join('');
            html += '</div></div>';
        }
    });
    
    companyListForMulti.innerHTML = html;
    
    // 연도별 기업 수 로그
    const yearCounts = years.map(year => {
        const count = companyData.filter(c => c.year === year).length;
        return `${year}년: ${count}개`;
    }).join(', ');
    console.log(`[DEBUG] ${companyData.length}개 기업 로드 완료 (${yearCounts})`);
    
    // 연도별 전체 선택/해제 이벤트 리스너 추가
    setupYearCheckboxListeners();
}

// 전체 선택/해제
if (selectAllCompanies) {
    selectAllCompanies.addEventListener('change', function() {
        const checkboxes = companyListForMulti.querySelectorAll('.company-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = selectAllCompanies.checked;
        });
        
        // 연도별 체크박스도 업데이트
        const yearCheckboxes = companyListForMulti.querySelectorAll('.year-checkbox');
        yearCheckboxes.forEach(checkbox => {
            checkbox.checked = selectAllCompanies.checked;
        });
    });
}

// 연도별 체크박스 이벤트 리스너 설정
function setupYearCheckboxListeners() {
    const yearCheckboxes = companyListForMulti.querySelectorAll('.year-checkbox');
    
    yearCheckboxes.forEach(yearCheckbox => {
        yearCheckbox.addEventListener('change', function() {
            const year = this.dataset.year;
            const companyCheckboxes = companyListForMulti.querySelectorAll(`.year-${year}`);
            
            // 해당 연도의 모든 기업 체크박스 상태 변경
            companyCheckboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
            });
            
            console.log(`[DEBUG] ${year}년 기업 ${this.checked ? '전체 선택' : '전체 해제'}`);
            
            // 전체 선택 체크박스 상태 업데이트
            updateSelectAllCheckbox();
        });
    });
    
    // 개별 기업 체크박스 변경 시 연도별/전체 체크박스 상태 업데이트
    const companyCheckboxes = companyListForMulti.querySelectorAll('.company-checkbox');
    companyCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            updateYearCheckboxes();
            updateSelectAllCheckbox();
        });
    });
}

// 연도별 체크박스 상태 업데이트
function updateYearCheckboxes() {
    ['2024', '2025'].forEach(year => {
        const yearCheckbox = companyListForMulti.querySelector(`.year-checkbox[data-year="${year}"]`);
        if (!yearCheckbox) return;
        
        const companyCheckboxes = companyListForMulti.querySelectorAll(`.year-${year}`);
        const checkedCount = Array.from(companyCheckboxes).filter(cb => cb.checked).length;
        
        yearCheckbox.checked = checkedCount === companyCheckboxes.length;
        yearCheckbox.indeterminate = checkedCount > 0 && checkedCount < companyCheckboxes.length;
    });
}

// 전체 선택 체크박스 상태 업데이트
function updateSelectAllCheckbox() {
    if (!selectAllCompanies) return;
    
    const allCheckboxes = companyListForMulti.querySelectorAll('.company-checkbox');
    const checkedCount = Array.from(allCheckboxes).filter(cb => cb.checked).length;
    
    selectAllCompanies.checked = checkedCount === allCheckboxes.length;
    selectAllCompanies.indeterminate = checkedCount > 0 && checkedCount < allCheckboxes.length;
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
            // 기본설정기간 (2024-01-01)
            multiStartDate.value = '2024-01-01';
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
        // 다운로드 버튼 상태인지 확인
        if (startMultiSearchBtn.dataset.zipFilename) {
            // 다운로드 실행
            downloadMultiCompanyResult(startMultiSearchBtn.dataset.zipFilename);
        } else {
            // 검색 실행
            startMultiCompanySearch();
        }
    });
}

function downloadMultiCompanyResult(zipFilename) {
    console.log('[DEBUG] ZIP 파일 다운로드:', zipFilename);
    
    // ZIP 파일 다운로드
    const downloadLink = document.createElement('a');
    downloadLink.href = `/api/download-multi-result/${zipFilename}`;
    downloadLink.download = zipFilename;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    
    // 다운로드 후 모달 닫기
    setTimeout(() => {
        hideMultiCompanyModal();
        
        // 버튼 상태 초기화
        startMultiSearchBtn.disabled = false;
        startMultiSearchBtn.innerHTML = '<i class="fas fa-search"></i> 기사 조회 시작';
        startMultiSearchBtn.className = 'btn btn-primary';
        delete startMultiSearchBtn.dataset.zipFilename;
        
        // 진행 상태 숨기기
        const progressSection = document.getElementById('multiProgressSection');
        if (progressSection) {
            progressSection.style.display = 'none';
        }
    }, 500);
}

// 전역 변수로 AbortController 저장
let multiSearchAbortController = null;

async function startMultiCompanySearch() {
    console.log('[DEBUG] 다수 기업 검색 시작');
    
    // 선택된 기업 가져오기
    const checkboxes = companyListForMulti.querySelectorAll('.company-checkbox:checked');
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
    
    // AbortController 생성
    multiSearchAbortController = new AbortController();
    
    // 버튼 비활성화
    startMultiSearchBtn.disabled = true;
    startMultiSearchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 검색 중...';
    startMultiSearchBtn.className = 'btn btn-primary';
    
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
        // 백엔드 API 호출 (AbortController 신호 추가)
        const response = await fetch('/api/multi-company-search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                companies: selectedCompanies,
                start_date: startDate,
                end_date: endDate
            }),
            signal: multiSearchAbortController.signal
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
                                // 완료 - 다운로드 버튼으로 변경
                                console.log('[DEBUG] 모든 검색 완료, ZIP 파일명:', data.zip_filename);
                                
                                // 진행 상태에 완료 메시지 추가
                                const progressDetails = document.getElementById('multiProgressDetails');
                                const completionDiv = document.createElement('div');
                                completionDiv.className = 'progress-item completion-message';
                                completionDiv.style.cssText = 'color: #28a745; font-weight: bold; margin-top: 15px; padding: 10px; background-color: #d4edda; border-radius: 4px; border-left: 4px solid #28a745;';
                                completionDiv.innerHTML = `<i class="fas fa-check-circle"></i> 총 ${data.success_count}개 기업의 뉴스 조회가 완료되었습니다!`;
                                progressDetails.appendChild(completionDiv);
                                progressDetails.scrollTop = progressDetails.scrollHeight;
                                
                                // 버튼을 다운로드 버튼으로 변경
                                startMultiSearchBtn.disabled = false;
                                startMultiSearchBtn.innerHTML = '<i class="fas fa-download"></i> 엑셀 다운로드';
                                startMultiSearchBtn.className = 'btn btn-success';
                                
                                // ZIP 파일명 저장
                                startMultiSearchBtn.dataset.zipFilename = data.zip_filename;
                                
                                // 완료 로그
                                console.log(`[INFO] 모든 기업 검색 완료 - 성공: ${data.success_count}개, 실패: ${data.error_count}개`);
                                
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
        // AbortError는 사용자가 의도적으로 취소한 것이므로 경고 표시 안 함
        if (error.name === 'AbortError') {
            console.log('[INFO] 다수 기업 검색이 사용자에 의해 취소되었습니다.');
            // 취소된 경우에만 버튼 상태 복원
            startMultiSearchBtn.disabled = false;
            startMultiSearchBtn.innerHTML = '<i class="fas fa-search"></i> 기사 조회 시작';
            startMultiSearchBtn.className = 'btn btn-primary';
        } else {
            console.error('[ERROR] 다수 기업 검색 실패:', error);
            alert(`다수 기업 검색 중 오류가 발생했습니다: ${error.message}`);
            // 오류 발생 시에만 버튼 상태 복원
            startMultiSearchBtn.disabled = false;
            startMultiSearchBtn.innerHTML = '<i class="fas fa-search"></i> 기사 조회 시작';
            startMultiSearchBtn.className = 'btn btn-primary';
        }
    } finally {
        // AbortController 정리
        multiSearchAbortController = null;
    }
}
// app.js 파일 끝에 추가할 코드

// ==================== 기업 관리 ====================

let currentSelectedYear = null;
let companiesData = {};

// 기업 관리 모달 열기/닫기
const companyManagementModal = document.getElementById('companyManagementModal');
const openCompanyManagementBtn = document.getElementById('openCompanyManagementBtn');
const closeCompanyManagementModal = document.getElementById('closeCompanyManagementModal');
const closeCompanyManagementBtn = document.getElementById('closeCompanyManagementBtn');

if (openCompanyManagementBtn) {
    openCompanyManagementBtn.addEventListener('click', function() {
        companyManagementModal.classList.add('show');
        loadCompanyManagement();
    });
}

if (closeCompanyManagementModal) {
    closeCompanyManagementModal.addEventListener('click', hideCompanyManagementModal);
}

if (closeCompanyManagementBtn) {
    closeCompanyManagementBtn.addEventListener('click', hideCompanyManagementModal);
}

function hideCompanyManagementModal() {
    companyManagementModal.classList.remove('show');
}

// 기업 관리 데이터 로드
async function loadCompanyManagement() {
    try {
        const response = await fetch('/api/companies');
        const data = await response.json();
        
        if (data.success) {
            companiesData = data.companies_by_year;
            renderYearTabs();
            
            // 첫 번째 연도 선택 (가장 최신 연도)
            const years = Object.keys(companiesData).sort((a, b) => b - a);
            if (years.length > 0) {
                selectYear(parseInt(years[0]));
            }
        } else {
            console.error('[ERROR] 기업 목록 로드 실패');
        }
    } catch (error) {
        console.error('[ERROR] 기업 목록 로드 실패:', error);
        alert('기업 목록을 불러오는데 실패했습니다.');
    }
}

// 연도 탭 렌더링
function renderYearTabs() {
    const yearTabs = document.getElementById('yearTabs');
    const years = Object.keys(companiesData).sort((a, b) => b - a);
    
    let html = '';
    years.forEach(year => {
        const count = companiesData[year].length;
        html += `
            <button class="year-tab-btn" data-year="${year}" style="
                padding: 10px 20px;
                border: 2px solid #e9ecef;
                background: white;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: all 0.2s;
            ">
                ${year}년 <span style="color: #6c757d; font-size: 12px;">(${count})</span>
            </button>
        `;
    });
    
    // 새 연도 추가 버튼
    html += `
        <button id="addNewYearBtn" style="
            padding: 10px 20px;
            border: 2px dashed #4285f4;
            background: white;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            color: #4285f4;
            transition: all 0.2s;
        ">
            <i class="fas fa-plus"></i> 새 연도
        </button>
    `;
    
    yearTabs.innerHTML = html;
    
    // 연도 탭 클릭 이벤트
    document.querySelectorAll('.year-tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            selectYear(parseInt(this.dataset.year));
        });
    });
    
    // 새 연도 추가 버튼 이벤트
    const addNewYearBtn = document.getElementById('addNewYearBtn');
    if (addNewYearBtn) {
        addNewYearBtn.addEventListener('click', function() {
            const currentYear = new Date().getFullYear();
            const nextYear = Math.max(...Object.keys(companiesData).map(y => parseInt(y)), currentYear) + 1;
            document.getElementById('newCompanyYear').value = nextYear;
            document.getElementById('newCompanyName').focus();
        });
    }
}

// 연도 선택
function selectYear(year) {
    currentSelectedYear = year;
    
    // 탭 활성화 상태 업데이트
    document.querySelectorAll('.year-tab-btn').forEach(btn => {
        if (parseInt(btn.dataset.year) === year) {
            btn.style.background = '#4285f4';
            btn.style.color = 'white';
            btn.style.borderColor = '#4285f4';
        } else {
            btn.style.background = 'white';
            btn.style.color = '#333';
            btn.style.borderColor = '#e9ecef';
        }
    });
    
    // 기업 목록 렌더링
    renderCompanyManagementList(year);
    
    // 연도 입력 필드 업데이트
    document.getElementById('newCompanyYear').value = year;
}

// 기업 관리 모달 - 기업 목록 렌더링
function renderCompanyManagementList(year) {
    const companyListManagement = document.getElementById('companyListManagement');
    const companies = companiesData[year] || [];
    
    // 카운트 업데이트
    document.getElementById('companyCountBadge').textContent = companies.length;
    
    if (companies.length === 0) {
        companyListManagement.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #6c757d;">
                <i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
                <p>등록된 기업이 없습니다.</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    companies.forEach(company => {
        html += `
            <div class="company-item" data-company-id="${company.id}" style="
                border: 1px solid #e9ecef;
                border-radius: 6px;
                padding: 12px;
                background: white;
                display: flex;
                justify-content: space-between;
                align-items: center;
                transition: all 0.2s;
            ">
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 500; font-size: 14px; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${company.name}
                    </div>
                    <div style="font-size: 12px; color: #6c757d; margin-top: 4px;">
                        ${company.year}년
                    </div>
                </div>
                <div style="display: flex; gap: 5px;">
                    <button class="edit-company-btn" data-company-id="${company.id}" style="
                        padding: 6px 10px;
                        border: 1px solid #4285f4;
                        background: white;
                        color: #4285f4;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 12px;
                        transition: all 0.2s;
                    " title="수정">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="delete-company-btn" data-company-id="${company.id}" style="
                        padding: 6px 10px;
                        border: 1px solid #dc3545;
                        background: white;
                        color: #dc3545;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 12px;
                        transition: all 0.2s;
                    " title="삭제">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });
    
    companyListManagement.innerHTML = html;
    
    // 수정/삭제 버튼 이벤트
    document.querySelectorAll('.edit-company-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            editCompany(parseInt(this.dataset.companyId));
        });
    });
    
    document.querySelectorAll('.delete-company-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            deleteCompany(parseInt(this.dataset.companyId));
        });
    });
}

// 기업 추가
const addCompanyBtn = document.getElementById('addCompanyBtn');
const newCompanyName = document.getElementById('newCompanyName');
const newCompanyYear = document.getElementById('newCompanyYear');

if (addCompanyBtn) {
    addCompanyBtn.addEventListener('click', async function() {
        const name = newCompanyName.value.trim();
        const year = parseInt(newCompanyYear.value);
        
        if (!name) {
            alert('기업명을 입력해주세요.');
            newCompanyName.focus();
            return;
        }
        
        if (!year || year < 2020 || year > 2100) {
            alert('올바른 연도를 입력해주세요. (2020-2100)');
            newCompanyYear.focus();
            return;
        }
        
        try {
            const response = await fetch('/api/companies', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: name,
                    year: year,
                    display_order: 0
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                alert(data.message);
                newCompanyName.value = '';
                loadCompanyManagement();
            } else {
                alert(data.error || '기업 추가에 실패했습니다.');
            }
        } catch (error) {
            console.error('[ERROR] 기업 추가 실패:', error);
            alert('기업 추가 중 오류가 발생했습니다.');
        }
    });
}

// 기업 수정
function editCompany(companyId) {
    // 해당 기업 찾기
    let company = null;
    for (const year in companiesData) {
        const found = companiesData[year].find(c => c.id === companyId);
        if (found) {
            company = found;
            break;
        }
    }
    
    if (!company) {
        alert('기업을 찾을 수 없습니다.');
        return;
    }
    
    const newName = prompt(`기업명을 수정하세요:`, company.name);
    if (newName === null) return; // 취소
    
    const trimmedName = newName.trim();
    if (!trimmedName) {
        alert('기업명을 입력해주세요.');
        return;
    }
    
    if (trimmedName === company.name) {
        return; // 변경사항 없음
    }
    
    updateCompany(companyId, { name: trimmedName });
}

// 기업 업데이트 API 호출
async function updateCompany(companyId, updates) {
    try {
        const response = await fetch(`/api/companies/${companyId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(updates)
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(data.message);
            loadCompanyManagement();
        } else {
            alert(data.error || '기업 수정에 실패했습니다.');
        }
    } catch (error) {
        console.error('[ERROR] 기업 수정 실패:', error);
        alert('기업 수정 중 오류가 발생했습니다.');
    }
}

// 기업 삭제
async function deleteCompany(companyId) {
    // 해당 기업 찾기
    let company = null;
    for (const year in companiesData) {
        const found = companiesData[year].find(c => c.id === companyId);
        if (found) {
            company = found;
            break;
        }
    }
    
    if (!company) {
        alert('기업을 찾을 수 없습니다.');
        return;
    }
    
    if (!confirm(`'${company.name}' 기업을 삭제하시겠습니까?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/companies/${companyId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(data.message);
            loadCompanyManagement();
        } else {
            alert(data.error || '기업 삭제에 실패했습니다.');
        }
    } catch (error) {
        console.error('[ERROR] 기업 삭제 실패:', error);
        alert('기업 삭제 중 오류가 발생했습니다.');
    }
}

// Enter 키로 기업 추가
if (newCompanyName) {
    newCompanyName.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            addCompanyBtn.click();
        }
    });
}

if (newCompanyYear) {
    newCompanyYear.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            addCompanyBtn.click();
        }
    });
}
