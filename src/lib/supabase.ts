import { createClient } from '@supabase/supabase-js';

// Vite 환경변수에서 Supabase 접속 정보를 불러옵니다.
// .env 파일에 VITE_SUPABASE_URL 과 VITE_SUPABASE_ANON_KEY 를 반드시 설정해주세요.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[Supabase] 환경변수가 설정되지 않았습니다.\n' +
    '.env 파일에 VITE_SUPABASE_URL 과 VITE_SUPABASE_ANON_KEY 를 입력해주세요.'
  );
}

// Supabase 클라이언트 싱글턴 생성
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// DB에 저장할 주문 데이터 타입
export interface OrderInsert {
  customer_name: string;
  phone: string;
  beverage_name: string;
  beverage_price: number;
  size: string;
  size_price: number;
  options: string[];
  options_price: number;
  quantity: number;
  requests: string;
  total_price: number;
}

