/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Coffee, RotateCcw, CheckCircle2, AlertCircle, ReceiptText, ChevronDown, Loader2 } from 'lucide-react';
import { supabase } from './lib/supabase';

// ==========================================
// 1. 타입 정의 및 메뉴 데이터 상수
// ==========================================

// 음료 정보 인터페이스
interface BeverageOption {
  id: string;
  name: string;
  price: number;
}

// 음료 목록 데이터
const BEVERAGES: BeverageOption[] = [
  { id: 'americano', name: '아메리카노', price: 3500 },
  { id: 'caffe_latte', name: '카페라떼', price: 4000 },
  { id: 'caffe_mocha', name: '카페모카', price: 4500 },
  { id: 'vanilla_latte', name: '바닐라라떼', price: 4500 },
  { id: 'green_tea_latte', name: '녹차라떼', price: 4500 },
];

// 사이즈 옵션 데이터 (S: +0원, M: +500원 [기본], L: +1,000원)
interface SizeOption {
  id: 'S' | 'M' | 'L';
  name: string;
  extraPrice: number;
}

const SIZES: SizeOption[] = [
  { id: 'S', name: 'S', extraPrice: 0 },
  { id: 'M', name: 'M', extraPrice: 500 },
  { id: 'L', name: 'L', extraPrice: 1000 },
];

// 추가 옵션 데이터
interface ExtraOption {
  id: string;
  name: string;
  price: number;
}

const EXTRA_OPTIONS: ExtraOption[] = [
  { id: 'shot', name: '샷 추가', price: 500 },
  { id: 'cream', name: '크림 추가', price: 500 },
  { id: 'syrup', name: '시럽 추가', price: 300 },
  { id: 'decaf', name: '디카페인', price: 0 },
];

// 주문 내역 타입
interface OrderRecord {
  id: string;
  customerName: string;
  phone: string;
  beverageName: string;
  beveragePrice: number;
  size: 'S' | 'M' | 'L';
  sizePrice: number;
  options: string[];
  optionsPrice: number;
  quantity: number;
  requests: string;
  totalPrice: number;
  createdAt: string;
}

export default function App() {
  // ==========================================
  // 상태 관리 (State)
  // ==========================================
  const [customerName, setCustomerName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [selectedBeverageId, setSelectedBeverageId] = useState<string>(''); // 기본 미선택
  const [selectedSize, setSelectedSize] = useState<'S' | 'M' | 'L'>('M'); // 기본 M
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState<number>(1); // 기본 1
  const [requests, setRequests] = useState<string>('');

  // 유효성 검사 및 주문 결과 메시지 상태
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [confirmationMessage, setConfirmationMessage] = useState<string>('');
  
  // Supabase 저장 중 로딩 상태 (중복 제출 방지)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  // Supabase DB 오류 메시지
  const [dbError, setDbError] = useState<string>('');
  
  // 주문 이력 (로컬 스토리지 연동)
  const [orderHistory, setOrderHistory] = useState<OrderRecord[]>([]);

  // ==========================================
  // 실시간 예상 금액 계산 (useMemo)
  // ==========================================
  const currentBeverage = useMemo(() => {
    return BEVERAGES.find((b) => b.id === selectedBeverageId) || null;
  }, [selectedBeverageId]);

  const currentSizeObj = useMemo(() => {
    return SIZES.find((s) => s.id === selectedSize) || SIZES[1];
  }, [selectedSize]);

  const currentOptionsTotal = useMemo(() => {
    return selectedOptionIds.reduce((sum, optId) => {
      const opt = EXTRA_OPTIONS.find((o) => o.id === optId);
      return sum + (opt ? opt.price : 0);
    }, 0);
  }, [selectedOptionIds]);

  // 총 예상 금액: 음료 미선택 시 0원, 선택 시 (음료가격 + 사이즈추가금 + 옵션합계) * 수량
  const estimatedTotalPrice = useMemo(() => {
    if (!currentBeverage) {
      return 0;
    }
    const singleCupPrice = currentBeverage.price + currentSizeObj.extraPrice + currentOptionsTotal;
    return singleCupPrice * quantity;
  }, [currentBeverage, currentSizeObj, currentOptionsTotal, quantity]);

  // ==========================================
  // 이벤트 핸들러
  // ==========================================

  // 추가 옵션 체크박스 토글
  const handleOptionToggle = (optionId: string) => {
    setSelectedOptionIds((prev) =>
      prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]
    );
  };

  // 수량 변경 처리 (최소 1, 최대 10)
  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (isNaN(val)) {
      setQuantity(1);
    } else {
      const clampedVal = Math.min(10, Math.max(1, val));
      setQuantity(clampedVal);
    }
  };

  // 주문하기 버튼 클릭 처리 (Supabase에 데이터 저장)
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. 이름 검증
    if (!customerName.trim()) {
      setErrorMessage('이름을 입력해주세요');
      setConfirmationMessage('');
      document.getElementById('order-name')?.focus();
      return;
    }

    // 2. 음료 선택 검증
    if (!selectedBeverageId || !currentBeverage) {
      setErrorMessage('음료를 선택해주세요');
      setConfirmationMessage('');
      document.getElementById('order-beverage')?.focus();
      return;
    }

    // 에러 초기화, 로딩 시작
    setErrorMessage('');
    setDbError('');
    setIsSubmitting(true);

    // 옵션 텍스트 생성
    const selectedOptionsNames = selectedOptionIds
      .map((id) => EXTRA_OPTIONS.find((o) => o.id === id)?.name)
      .filter(Boolean) as string[];

    const optionsText =
      selectedOptionsNames.length > 0 ? ` (${selectedOptionsNames.join(', ')})` : '';

    // ── Supabase에 주문 데이터 INSERT ──────────────────
    const { error: supabaseError } = await supabase
      .from('orders')
      .insert({
        customer_name: customerName.trim(),
        phone: phone.trim(),
        beverage_name: currentBeverage.name,
        beverage_price: currentBeverage.price,
        size: selectedSize,
        size_price: currentSizeObj.extraPrice,
        options: selectedOptionsNames,          // text[] 컬럼
        options_price: currentOptionsTotal,
        quantity,
        requests: requests.trim(),
        total_price: estimatedTotalPrice,
      });

    setIsSubmitting(false);

    // DB 오류 처리
    if (supabaseError) {
      console.error('[Supabase] 주문 저장 실패:', supabaseError);
      setDbError(`주문 저장 중 오류가 발생했습니다: ${supabaseError.message}`);
      return;
    }
    // ───────────────────────────────────────────────────

    // 주문 확인 메시지 텍스트 조합
    const formattedPrice = estimatedTotalPrice.toLocaleString('ko-KR');
    const msg = `${customerName.trim()}님, ${currentBeverage.name} ${selectedSize}사이즈${optionsText} ${quantity}잔, 총 ${formattedPrice}원 주문이 접수되었습니다!`;
    setConfirmationMessage(msg);

    // 주문 기록 로컬 상태에도 보관
    const newOrder: OrderRecord = {
      id: Date.now().toString(),
      customerName: customerName.trim(),
      phone: phone.trim(),
      beverageName: currentBeverage.name,
      beveragePrice: currentBeverage.price,
      size: selectedSize,
      sizePrice: currentSizeObj.extraPrice,
      options: selectedOptionsNames,
      optionsPrice: currentOptionsTotal,
      quantity,
      requests: requests.trim(),
      totalPrice: estimatedTotalPrice,
      createdAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };

    setOrderHistory((prev) => [newOrder, ...prev]);
  };

  // 다시 작성 (초기화) 버튼 처리
  const handleReset = () => {
    setCustomerName('');
    setPhone('');
    setSelectedBeverageId('');
    setSelectedSize('M');
    setSelectedOptionIds([]);
    setQuantity(1);
    setRequests('');
    setErrorMessage('');
    setConfirmationMessage('');
  };

  return (
    <div className="min-h-screen py-8 px-4 flex flex-col items-center justify-start bg-[#faf6f0]">
      {/* ==========================================
          메인 컨테이너 (최대 너비 520px, 가운데 정렬, 둥근 모서리, 부드러운 그림자)
          ========================================== */}
      <main className="w-full max-w-[520px] bg-white rounded-2xl shadow-[0_8px_30px_rgb(107,66,38,0.08)] border border-[#ede3d8] p-6 sm:p-8">
        
        {/* ==========================================
            페이지 상단 로고 및 카페 소개
            - 카페 로고: ☕ 이모지 크게
            - 카페 이름: "바이브 카페"
            - 부제: "당신의 하루에 바이브를 더하다"
            ========================================== */}
        <header className="text-center pb-6 mb-6 border-b border-[#f0e6dc]">
          <div className="text-5xl mb-2 select-none" role="img" aria-label="카페 로고">
            ☕
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#6b4226] tracking-tight">
            바이브 카페
          </h1>
          <p className="text-sm sm:text-base text-[#8c6d58] mt-1 font-medium">
            당신의 하루에 바이브를 더하다
          </p>
        </header>

        {/* DB 저장 오류 메시지 */}
        {dbError && (
          <div
            role="alert"
            className="mb-5 p-3 rounded-lg bg-orange-50 border border-orange-200 text-orange-700 text-sm flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-orange-600" />
            <span className="font-semibold">{dbError}</span>
          </div>
        )}

        {/* 오류 알림 메시지 (유효성 검사 실패 시) */}
        {errorMessage && (
          <div
            role="alert"
            className="mb-5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2 animate-shake"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span className="font-semibold">{errorMessage}</span>
          </div>
        )}

        {/* ==========================================
            주문서 폼
            ========================================== */}
        <form onSubmit={handleSubmitOrder} noValidate className="space-y-5">
          
          {/* 1. 이름 (필수, text) */}
          <div>
            <label
              htmlFor="order-name"
              className="block text-sm font-bold text-[#4a3427] mb-1.5"
            >
              이름 <span className="text-red-500 font-bold">*</span>
            </label>
            <input
              id="order-name"
              type="text"
              required
              placeholder="주문자 성함을 입력해주세요 (예: 홍길동)"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="cafe-input text-sm placeholder:text-[#a89689]"
            />
          </div>

          {/* 2. 전화번호 (tel) */}
          <div>
            <label
              htmlFor="order-phone"
              className="block text-sm font-bold text-[#4a3427] mb-1.5"
            >
              전화번호
            </label>
            <input
              id="order-phone"
              type="tel"
              placeholder="010-0000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="cafe-input text-sm placeholder:text-[#a89689]"
            />
          </div>

          {/* 3. 음료 선택 (드롭다운) */}
          <div>
            <label
              htmlFor="order-beverage"
              className="block text-sm font-bold text-[#4a3427] mb-1.5"
            >
              음료 선택 <span className="text-red-500 font-bold">*</span>
            </label>
            <div className="relative">
              <select
                id="order-beverage"
                value={selectedBeverageId}
                onChange={(e) => setSelectedBeverageId(e.target.value)}
                className="cafe-input text-sm appearance-none pr-9 cursor-pointer"
              >
                <option value="">-- 음료를 선택해주세요 --</option>
                {BEVERAGES.map((beverage) => (
                  <option key={beverage.id} value={beverage.id}>
                    {beverage.name} ({beverage.price.toLocaleString('ko-KR')}원)
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-[#6b4226]">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* 4. 사이즈 (라디오 버튼, 가로 배치) */}
          <div>
            <label className="block text-sm font-bold text-[#4a3427] mb-1.5">
              사이즈 선택
            </label>
            {/* 가로로 나란히 배치, gap 간격 */}
            <div className="flex flex-row flex-wrap items-center gap-4 py-1">
              {SIZES.map((size) => {
                const isSelected = selectedSize === size.id;
                const extraText = size.extraPrice > 0 ? `+${size.extraPrice.toLocaleString('ko-KR')}원` : '+0원';
                const inputId = `size-${size.id}`;

                return (
                  <label
                    key={size.id}
                    htmlFor={inputId}
                    className={`flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg border text-sm transition-all select-none ${
                      isSelected
                        ? 'border-[#6b4226] bg-[#f9f3ec] text-[#6b4226] font-bold shadow-xs'
                        : 'border-[#e2d6c9] bg-white text-[#5c4436] hover:bg-[#faf6f0]'
                    }`}
                  >
                    <input
                      id={inputId}
                      type="radio"
                      name="cafe-size"
                      value={size.id}
                      checked={isSelected}
                      onChange={() => setSelectedSize(size.id)}
                      className="accent-[#6b4226] w-4 h-4 cursor-pointer"
                    />
                    <span>
                      {size.name} <span className="text-xs opacity-75">({extraText})</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* 5. 추가 옵션 (체크박스, 가로 배치) */}
          <div>
            <label className="block text-sm font-bold text-[#4a3427] mb-1.5">
              추가 옵션
            </label>
            {/* 가로로 나란히 배치, gap 간격 */}
            <div className="flex flex-row flex-wrap items-center gap-3 py-1">
              {EXTRA_OPTIONS.map((opt) => {
                const isChecked = selectedOptionIds.includes(opt.id);
                const priceText = opt.price > 0 ? `+${opt.price.toLocaleString('ko-KR')}원` : '+0원';
                const inputId = `option-${opt.id}`;

                return (
                  <label
                    key={opt.id}
                    htmlFor={inputId}
                    className={`flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg border text-sm transition-all select-none ${
                      isChecked
                        ? 'border-[#6b4226] bg-[#f9f3ec] text-[#6b4226] font-semibold'
                        : 'border-[#e2d6c9] bg-white text-[#5c4436] hover:bg-[#faf6f0]'
                    }`}
                  >
                    <input
                      id={inputId}
                      type="checkbox"
                      value={opt.id}
                      checked={isChecked}
                      onChange={() => handleOptionToggle(opt.id)}
                      className="accent-[#6b4226] w-4 h-4 rounded cursor-pointer"
                    />
                    <span>
                      {opt.name} <span className="text-xs opacity-75">({priceText})</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* 6. 수량 (number 타입, 최소 1, 최대 10, 기본값 1) */}
          <div>
            <label
              htmlFor="order-quantity"
              className="block text-sm font-bold text-[#4a3427] mb-1.5"
            >
              수량 (최대 10잔)
            </label>
            <div className="flex items-center gap-3">
              <input
                id="order-quantity"
                type="number"
                min={1}
                max={10}
                value={quantity}
                onChange={handleQuantityChange}
                className="cafe-input w-28 text-center text-sm font-semibold"
              />
              <span className="text-xs text-[#8c6d58]">
                * 1인 최대 10잔까지 주문 가능합니다.
              </span>
            </div>
          </div>

          {/* 7. 요청사항 (textarea) */}
          <div>
            <label
              htmlFor="order-requests"
              className="block text-sm font-bold text-[#4a3427] mb-1.5"
            >
              요청사항
            </label>
            <textarea
              id="order-requests"
              rows={3}
              placeholder="얼음 양, 농도 조절 등 바리스타에게 남길 메시지를 적어주세요."
              value={requests}
              onChange={(e) => setRequests(e.target.value)}
              className="cafe-input text-sm placeholder:text-[#a89689] resize-none"
            />
          </div>

          {/* ==========================================
              예상 금액 영역 (주문하기 버튼 바로 위에 큰 글씨로 표시)
              - 큰 글씨(24px), 갈색(#6b4226), 굵게, 가운데 정렬
              - 예: "예상 금액: 5,000원"
              ========================================== */}
          <div className="pt-2 pb-1">
            <div
              className="text-center font-bold text-[#6b4226] text-[24px] tracking-tight bg-[#faf6f0] py-3.5 px-4 rounded-xl border border-[#ede2d6]"
              aria-live="polite"
            >
              예상 금액: {estimatedTotalPrice.toLocaleString('ko-KR')}원
            </div>
            {!selectedBeverageId && (
              <p className="text-center text-xs text-[#9c7d68] mt-1.5">
                음료를 선택하시면 추가 옵션과 수량이 실시간으로 반영됩니다.
              </p>
            )}
          </div>

          {/* ==========================================
              버튼 영역
              8. 주문하기 버튼: 갈색 배경(#6b4226), 흰색 글씨, hover시 약간 밝게
              9. 다시 작성 버튼: 모든 입력과 금액 초기화
              ========================================== */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            {/* 주문하기 버튼 (2칸 차지) — isSubmitting 중에는 비활성화 */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="cafe-btn-submit sm:col-span-2 py-3 px-4 rounded-lg font-bold text-base shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>주문 접수 중...</span>
                </>
              ) : (
                <>
                  <Coffee className="w-5 h-5" />
                  <span>주문하기</span>
                </>
              )}
            </button>

            {/* 다시 작성 버튼 (1칸 차지) */}
            <button
              type="button"
              onClick={handleReset}
              className="py-3 px-4 rounded-lg font-semibold text-sm text-[#6b4226] bg-[#f2e9df] hover:bg-[#e7dcd0] active:scale-95 border border-[#dfd2c4] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>다시 작성</span>
            </button>
          </div>
        </form>

        {/* ==========================================
            주문 확인 메시지 영역
            - 연두색 배경, 초록 글씨, 둥근 모서리
            - 예: "홍길동님, 카페라떼 M사이즈 (샷 추가) 1잔, 총 5,000원 주문이 접수되었습니다!"
            ========================================== */}
        {confirmationMessage && (
          <section
            role="status"
            aria-live="polite"
            className="mt-6 p-4 rounded-lg bg-[#e8f5e9] border border-[#c8e6c9] text-[#1b5e20] shadow-sm transition-all"
          >
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#2e7d32] mt-0.5" />
              <div>
                <p className="font-bold text-sm sm:text-base leading-snug">
                  {confirmationMessage}
                </p>
                <p className="text-xs text-[#2e7d32] opacity-90 mt-1">
                  매장에서 정성껏 준비하겠습니다. 잠시만 기다려주세요! ☕
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ==========================================
            최근 접수 내역 (접이식 / 카드 형태)
            ========================================== */}
        {orderHistory.length > 0 && (
          <section className="mt-8 pt-5 border-t border-[#f0e6dc]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#8c6d58] flex items-center gap-1.5">
                <ReceiptText className="w-3.5 h-3.5" />
                <span>방금 접수된 주문 ({orderHistory.length}건)</span>
              </h2>
              <button
                type="button"
                onClick={() => setOrderHistory([])}
                className="text-xs text-[#a89689] hover:text-[#6b4226] transition-colors"
              >
                기록 지우기
              </button>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {orderHistory.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-[#faf6f0] rounded-lg border border-[#eee4d9] text-xs flex justify-between items-center"
                >
                  <div>
                    <span className="font-bold text-[#6b4226]">{item.customerName}님</span>
                    <span className="text-[#8c6d58] ml-1.5">
                      · {item.beverageName} ({item.size}) {item.quantity}잔
                    </span>
                    {item.options.length > 0 && (
                      <span className="text-[#a1826d] ml-1 block sm:inline">
                        [{item.options.join(', ')}]
                      </span>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-bold text-[#6b4226]">
                      {item.totalPrice.toLocaleString('ko-KR')}원
                    </span>
                    <span className="text-[10px] text-[#b09e91] block">{item.createdAt}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

      </main>

      {/* 하단 푸터 */}
      <footer className="mt-8 text-center text-xs text-[#8c6d58] select-none">
        <p>© 2026 바이브 카페 (Vibe Cafe). All rights reserved.</p>
        <p className="mt-1 opacity-75">따뜻한 베이지(#faf6f0)와 브라운(#6b4226)의 조화</p>
      </footer>
    </div>
  );
}
