"use client";

import { useState } from "react";
import { FeatureRoadmap } from "@/components/feature-roadmap";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { Hero } from "@/components/hero";
import { HeroDemo } from "@/components/hero-demo";
import { ProblemFlow } from "@/components/problem-flow";
import { SignupForm } from "@/components/signup-form";

export function LandingPage() {
  const [email, setEmail] = useState("");

  function moveEmailToSignup(value: string) {
    setEmail(value);
    window.requestAnimationFrame(() => {
      document.getElementById("signup")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <>
      <Header />
      <main>
        <Hero onEmailReady={moveEmailToSignup} />
        <HeroDemo />
        <ProblemFlow />
        <FeatureRoadmap />
        <SignupForm email={email} setEmail={setEmail} />
      </main>
      <Footer />
    </>
  );
}
