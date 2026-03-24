'use client';

import { useState } from 'react';
import { Mail, MessageCircle, HelpCircle, Send, Phone, MapPin, Paperclip } from 'lucide-react';

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    type: 'general',
    message: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // UI만 구현하므로 실제 제출 로직 없음
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
    }, 1000);
  };

  const faqs = [
    {
      question: '1️⃣ 엑클로드는 어떤 서비스인가요?',
      answer:
        '엑셀로 받은 주문뿐만 아니라 \n' +
        '카카오톡, 주문페이지, 텍스트, 사진에서 주문정보를 다시 정리하지 않고 \n' +
        '그대로 업로드용 엑셀 파일로 변환해주는 서비스입니다.\n\n' +
        '반복되는 수작업을 복사 → 붙여넣기 → 주문정리를 \n' +
        '몇 초 안에 처리할 수 있습니다.',
    },
    {
      question: '2️⃣ 무료로 사용할 수 있나요?',
      answer:
        '네, 기본 기능은 무료로 제공됩니다.\n\n' +
        '처음 사용하는 분들도 부담 없이 시작하고, 서비스가 맞는지 충분히 확인하실 수 있습니다.\n\n' +
        '업무량이 많아질수록 유료 플랜을 통해 더욱 효율적으로 활용하실 수 있습니다.',
    },
    {
      question: '3️⃣ 어떤 형식의 데이터를 변환할 수 있나요?',
      answer:
        '- 카카오톡 주문 내용\n' +
        '- 텍스트 주문\n' +
        '- 엑셀 주문 파일\n' +
        '- 이미지 주문 (OCR)\n\n' +
        '다양한 형태의 주문 데이터를 자동으로 변환합니다.',
    },
    {
      question: '4️⃣ 변환된 파일은 어디에 사용하나요?',
      answer:
        '생성된 엑셀 파일은 CJ, 한진, 롯데 등 택배사 업로드 양식에 맞게 제작되어\n' +
        '바로 업로드에 사용할 수 있습니다.',
    },
    {
      question: '5️⃣ 처리 시간은 얼마나 걸리나요?',
      answer:
        '일반적으로 몇 초 내에 변환이 완료되며,\n' +
        '파일 크기 및 데이터 양에 따라 최대 1분 이내 처리됩니다.',
    },
    {
      question: '6️⃣ 데이터는 안전한가요?',
      answer:
        '업로드된 데이터는 안전하게 처리되며, 외부에 공유되지 않습니다.\n\n' +
        '필요 시 일정 기간 후 자동 삭제됩니다.',
    },
  ];

  return (
    <div className="pt-12 bg-zinc-50 dark:bg-black min-h-screen">
      <main className="max-w-[1200px] mx-auto px-8 py-8">
        {/* 헤더 */}
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-zinc-950 dark:text-zinc-100 mb-3">
            고객문의
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            궁금한 점이 있으시면 언제든지 문의해주세요.
          </p>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            평균 답변 시간은 <span className="font-medium text-zinc-700 dark:text-zinc-200">영업일 기준 1일 이내</span>입니다.
          </p>
          <p className="mt-1 text-xs sm:text-sm text-zinc-500 dark:text-zinc-500">
            운영시간: 평일 10:00 ~ 18:00 (주말·공휴일 휴무)
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {/* 문의 폼 */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 lg:p-8 space-y-6">
              <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-6">
                문의하기
              </h2>
              
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* 문의 유형 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                      문의 유형
                    </label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                      className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="general">일반 문의</option>
                      <option value="billing">결제 문의</option>
                      <option value="bug">오류 신고</option>
                      <option value="feature">기능 요청</option>
                      <option disabled>──────────</option>
                      <option value="partner">제휴 / 협업 문의</option>
                      <option value="business">비즈니스 문의</option>
                    </select>
                  </div>
                  <div className="hidden sm:block" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    이름
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="이름을 입력해주세요"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    이메일
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="이메일을 입력해주세요"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    제목
                  </label>
                  <input
                    type="text"
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="문의 제목을 입력해주세요"
                  />
                </div>
                
                {/* 비즈니스 문의 전용 필드 */}
                {formData.type === 'business' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                        회사명
                      </label>
                      <input
                        type="text"
                        className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="회사명을 입력해주세요"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                        연락처
                      </label>
                      <input
                        type="text"
                        className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="연락 가능한 전화번호를 입력해주세요"
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4">
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    문의 내용
                  </label>
                  <textarea
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    rows={10}
                    className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm leading-relaxed"
                    placeholder={
                      formData.type === 'business'
                        ? '협업 또는 제안 내용을 자세히 작성해주세요'
                        : '문의 내용을 입력해주세요'
                    }
                  />
                  {/* 첨부파일 */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                      첨부파일 (선택)
                    </label>
                    <label className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/40 cursor-pointer hover:border-blue-500 hover:bg-blue-50/60 dark:hover:bg-zinc-800/60 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-600/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
                          <Paperclip className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs sm:text-sm font-medium text-zinc-800 dark:text-zinc-100">
                            파일 선택
                          </span>
                          <span className="text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-400">
                            스크린샷, 엑셀 파일 등을 첨부하시면 더 빠르게 도와드릴 수 있어요.
                          </span>
                        </div>
                      </div>
                      <span className="text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1 max-w-[160px] text-right">
                        {attachmentName ?? '선택된 파일 없음'}
                      </span>
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          setAttachmentName(file ? file.name : null);
                        }}
                      />
                    </label>
                  </div>
                </div>
                
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
                >
                  {isSubmitting ? (
                    <>
                      <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
                      <span>전송 중...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      문의하기
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* 연락처 정보 */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 lg:p-6">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
                문의 및 안내
              </h3>
              
              <div className="space-y-4 text-sm">
                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-zinc-700 dark:text-zinc-300">📧 이메일</p>
                    <p className="text-zinc-600 dark:text-zinc-400">support@excload.com</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <Phone className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-zinc-700 dark:text-zinc-300">🕐 운영 시간</p>
                    <p className="text-zinc-600 dark:text-zinc-400">평일 10:00 ~ 18:00</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <MessageCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-zinc-700 dark:text-zinc-300">💬 안내</p>
                    <p className="text-zinc-600 dark:text-zinc-400">
                      문의는 접수 후 순차적으로 답변드립니다.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* FAQ */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 lg:p-6">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                자주 묻는 질문
              </h3>
              
              <div className="space-y-4">
                {faqs.map((faq, index) => (
                  <div key={index} className="border-b border-zinc-200 dark:border-zinc-800 pb-4 last:border-0">
                    <p className="font-medium text-zinc-900 dark:text-zinc-100 mb-1 text-sm">
                      {faq.question}
                    </p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      {faq.answer}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
