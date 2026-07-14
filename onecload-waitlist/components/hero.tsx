"use client";

import { FormEvent, useState } from "react";

type HeroProps = {
  onEmailReady: (email: string) => void;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const heroFeatures = ["쇼핑몰 주문 연동", "카톡 주문 자동 정리", "여러 쇼핑몰 주문파일 통합", "송장번호 자동 매칭·전송"];

export function Hero({ onEmailReady }: HeroProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError("이메일 주소를 입력해 주세요.");
      return;
    }

    if (!emailPattern.test(trimmedEmail)) {
      setError("이메일 형식이 올바르지 않습니다. 예: name@example.com");
      return;
    }

    setError("");
    onEmailReady(trimmedEmail);
  }

  return (
    <section id="top" className="mx-auto max-w-7xl px-5 pb-20 pt-16 sm:px-6 md:pb-24 md:pt-24 lg:px-8">
      <div className="mx-auto max-w-5xl text-center">
        <p className="mb-6 inline-flex border border-line bg-white px-3 py-1 text-sm font-semibold text-brand-800">
          온라인 판매자를 위한 주문 업무 자동화
        </p>
        <h1 className="keep-all text-[2.35rem] font-semibold leading-[1.18] text-ink-950 sm:text-5xl lg:text-[3.55rem]">
          <span className="lg:whitespace-nowrap">주문 확인부터 송장 전송까지,</span>
          <br />
          <span className="lg:whitespace-nowrap">반복되는 판매 업무를 한곳에서.</span>
        </h1>
        <p className="mx-auto mt-7 max-w-3xl keep-all text-lg leading-8 text-ink-700 sm:text-xl">
          쇼핑몰 주문 연동, 카톡 주문 자동 정리,
          <br className="hidden sm:block" />
          여러 주문파일 통합과 송장번호 자동 매칭·전송을 준비하고 있습니다.
        </p>

        <form className="mx-auto mt-10 max-w-3xl" onSubmit={handleSubmit} noValidate>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
            <input
              type="email"
              value={email}
              onChange={(event) => {
                setError("");
                setEmail(event.target.value);
              }}
              aria-label="개발 소식을 받을 이메일 주소"
              aria-invalid={Boolean(error)}
              className="focus-ring min-h-14 w-full border border-line bg-white px-4 text-base text-ink-950 placeholder:text-ink-500"
              placeholder="이메일 주소를 입력하세요"
            />
            <button type="submit" className="focus-ring min-h-14 bg-brand-800 px-5 text-base font-semibold text-white hover:bg-brand-900">
              개발 소식 받기
            </button>
          </div>
          {error ? (
            <p className="mt-3 text-left text-sm font-semibold text-red-700" role="alert">
              {error}
            </p>
          ) : null}
        </form>

        <p className="mt-5 text-sm leading-6 text-ink-500">
          회원가입 없이 이메일만 남겨주세요.
          <br />
          준비된 기능부터 테스트와 개발 소식을 알려드립니다.
        </p>

        <ul className="mx-auto mt-10 flex max-w-4xl flex-wrap justify-center gap-x-5 gap-y-3 border-y border-line py-5 text-sm font-semibold text-ink-700">
          {heroFeatures.map((feature) => (
            <li className="flex items-center gap-3" key={feature}>
              <span className="h-px w-5 bg-brand-700" aria-hidden="true" />
              {feature}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
