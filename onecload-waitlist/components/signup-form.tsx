"use client";

import { Dispatch, FormEvent, SetStateAction, useId, useState } from "react";
import { featureOptions, orderVolumeOptions, participationOptions, priceOptions } from "@/lib/site";

type SignupFormProps = {
  email: string;
  setEmail: Dispatch<SetStateAction<string>>;
};

type FormErrors = {
  features?: string;
  email?: string;
  privacy?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const allFeaturesOption = "모두 관심 있음";
const individualFeatureOptions = featureOptions.filter((feature) => feature !== allFeaturesOption);

function maskEmail(value: string) {
  const normalizedEmail = value.trim().toLowerCase();
  const [localPart, domain] = normalizedEmail.split("@");
  if (!localPart || !domain) {
    return normalizedEmail;
  }

  const letterPrefix = localPart.match(/^[A-Za-z]{2,}(?=\d+$)/)?.[0];
  const visibleLength = localPart.length <= 3 ? 1 : Math.min(4, localPart.length);
  const visiblePrefix = letterPrefix ?? localPart.slice(0, visibleLength);
  return `${visiblePrefix}****@${domain}`;
}

export function SignupForm({ email, setEmail }: SignupFormProps) {
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [participation, setParticipation] = useState("");
  const [orderVolume, setOrderVolume] = useState("");
  const [price, setPrice] = useState("");
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [newsAgreed, setNewsAgreed] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const emailId = useId();

  function toggleFeature(feature: string) {
    setSubmitted(false);
    setSelectedFeatures((current) => {
      if (current.includes(feature)) {
        return current.filter((item) => item !== feature);
      }

      if (feature === allFeaturesOption) {
        return [allFeaturesOption];
      }

      return [...current.filter((item) => item !== allFeaturesOption), feature];
    });
  }

  function validate() {
    const nextErrors: FormErrors = {};
    if (selectedFeatures.length === 0) {
      nextErrors.features = "관심 있는 기능을 한 개 이상 선택해 주세요.";
    }
    if (!email.trim()) {
      nextErrors.email = "이메일 주소를 입력해 주세요.";
    } else if (!emailPattern.test(email.trim())) {
      nextErrors.email = "이메일 형식이 올바르지 않습니다. 예: name@example.com";
    }
    if (!privacyAgreed) {
      nextErrors.privacy = "개인정보 수집·이용 동의가 필요합니다.";
    }
    return nextErrors;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    const isValid = Object.keys(nextErrors).length === 0;
    setSubmitted(isValid);
    setSubmittedEmail(isValid ? email.trim().toLowerCase() : "");
  }

  return (
    <section id="signup" className="border-t border-line bg-stone-100/70 py-16 md:py-20">
      <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold text-brand-800">개발 소식 신청</p>
          <h2 className="mt-3 keep-all text-3xl font-semibold leading-tight text-ink-950 sm:text-4xl">어떤 기능이 먼저 필요하신가요?</h2>
          <p className="mt-5 keep-all text-base leading-7 text-ink-700">
            관심 있는 기능의 개발 진행 상황과 무료 베타 테스트 일정을 이메일로 알려드립니다.
          </p>
        </div>

        <form className="mx-auto mt-10 max-w-4xl border border-line bg-white p-5 sm:p-7 md:p-8" onSubmit={handleSubmit} noValidate>
          <fieldset>
            <legend className="text-base font-bold text-ink-950">관심 기능 선택 <span className="text-brand-800">(필수)</span></legend>
            <p className="mt-1 text-sm text-ink-500">여러 개를 선택할 수 있습니다.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {individualFeatureOptions.map((feature) => {
                const checked = selectedFeatures.includes(feature);
                return (
                  <label
                    className="focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-700 flex cursor-pointer gap-3 border border-line bg-paper px-3 py-3 text-sm text-ink-850"
                    key={feature}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-brand-800"
                      checked={checked}
                      onChange={() => toggleFeature(feature)}
                    />
                    <span>{feature}</span>
                  </label>
                );
              })}
              <label className="focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-700 flex cursor-pointer gap-3 border border-brand-700 bg-teal-50 px-3 py-3 text-sm font-semibold text-brand-900 sm:col-span-2">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-brand-800"
                  checked={selectedFeatures.includes(allFeaturesOption)}
                  onChange={() => toggleFeature(allFeaturesOption)}
                />
                <span>{allFeaturesOption}</span>
              </label>
            </div>
            {errors.features ? <p className="mt-3 text-sm font-semibold text-red-700" role="alert">{errors.features}</p> : null}
          </fieldset>

          <div className="mt-7">
            <label className="text-base font-bold text-ink-950" htmlFor={emailId}>
              이메일 주소 <span className="text-brand-800">(필수)</span>
            </label>
            <input
              id={emailId}
              type="email"
              required
              value={email}
              onChange={(event) => {
                setSubmitted(false);
                setEmail(event.target.value);
              }}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? `${emailId}-error` : undefined}
              className="focus-ring mt-3 min-h-12 w-full border border-line bg-white px-4 text-base text-ink-950 placeholder:text-ink-500"
              placeholder="name@example.com"
            />
            {errors.email ? (
              <p className="mt-2 text-sm font-semibold text-red-700" id={`${emailId}-error`} role="alert">
                {errors.email}
              </p>
            ) : null}
          </div>

          <fieldset className="mt-7">
            <legend className="text-base font-bold text-ink-950">참여 방식 <span className="text-ink-500">(선택)</span></legend>
            <div className="mt-4 grid gap-2">
              {participationOptions.map((option) => (
                <label className="focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-700 flex cursor-pointer gap-3 border border-line px-3 py-3 text-sm text-ink-850" key={option}>
                  <input
                    type="radio"
                    name="participation"
                    className="mt-1 h-4 w-4 accent-brand-800"
                    checked={participation === option}
                    onChange={() => {
                      setSubmitted(false);
                      setParticipation(option);
                    }}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-7">
            <legend className="text-base font-bold text-ink-950">현재 주문량 <span className="text-ink-500">(선택)</span></legend>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {orderVolumeOptions.map((option) => (
                <label className="focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-700 flex cursor-pointer gap-3 border border-line px-3 py-3 text-sm text-ink-850" key={option}>
                  <input
                    type="radio"
                    name="orderVolume"
                    className="mt-1 h-4 w-4 accent-brand-800"
                    checked={orderVolume === option}
                    onChange={() => {
                      setSubmitted(false);
                      setOrderVolume(option);
                    }}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-7">
            <legend className="keep-all text-base font-bold text-ink-950">
              이 기능이 유료로 제공된다면 적절하다고 생각하는 월 이용료는 얼마인가요? <span className="text-ink-500">(선택)</span>
            </legend>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {priceOptions.map((option) => (
                <label className="focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-700 flex cursor-pointer gap-3 border border-line px-3 py-3 text-sm text-ink-850" key={option}>
                  <input
                    type="radio"
                    name="price"
                    className="mt-1 h-4 w-4 accent-brand-800"
                    checked={price === option}
                    onChange={() => {
                      setSubmitted(false);
                      setPrice(option);
                    }}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-7 space-y-3 border-t border-line pt-5">
            <label className="focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-700 flex cursor-pointer gap-3 text-sm leading-6 text-ink-850">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-brand-800"
                checked={privacyAgreed}
                onChange={(event) => {
                  setSubmitted(false);
                  setPrivacyAgreed(event.target.checked);
                }}
              />
              <span>
                개인정보 수집·이용에 동의합니다. <strong className="font-semibold text-brand-800">(필수)</strong>
              </span>
            </label>
            {errors.privacy ? <p className="text-sm font-semibold text-red-700" role="alert">{errors.privacy}</p> : null}
            <label className="focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-700 flex cursor-pointer gap-3 text-sm leading-6 text-ink-850">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-brand-800"
                checked={newsAgreed}
                onChange={(event) => {
                  setSubmitted(false);
                  setNewsAgreed(event.target.checked);
                }}
              />
              <span>
                개발 및 서비스 소식 이메일 수신에 동의합니다. <span className="text-ink-500">(선택)</span>
              </span>
            </label>
          </div>

          <button type="submit" className="focus-ring mt-7 min-h-12 w-full bg-brand-800 px-5 text-base font-semibold text-white hover:bg-brand-900">
            개발 소식 받기
          </button>

          {submitted ? (
            <div className="normal-case mt-5 border border-brand-700 bg-teal-50 p-4 text-sm leading-7 text-brand-900" role="status" aria-live="polite">
              <strong className="block normal-case">{maskEmail(submittedEmail)}으로 신청이 완료되었습니다.</strong>
              선택하신 기능의 테스트가 준비되면 알려드리겠습니다.
            </div>
          ) : null}
        </form>
      </div>
    </section>
  );
}
