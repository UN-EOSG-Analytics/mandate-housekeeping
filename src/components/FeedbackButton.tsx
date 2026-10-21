"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { connectFeedbackToModals } from "@/lib/feedback-modal";

export function FeedbackButton() {
  useEffect(() => {
    const feedback = Sentry.getFeedback();
    if (!feedback) return;

    const widget = feedback.createWidget();
    const host = document.getElementById("sentry-feedback");
    if (!host) {
      widget.removeFromDom();
      feedback.remove();
      return;
    }

    const style = document.createElement("style");
    style.textContent =
      ".widget__actor { border-radius: 0.5rem; } " +
      ".widget__actor svg { display: none; } " +
      ".form__label__text--required { font-size: 1em; } " +
      // Keep the icon on small screens, where Sentry hides the text label.
      "@media (max-width: 639px) { .widget__actor svg { display: block; } }";
    host.shadowRoot?.appendChild(style);

    const disconnect = connectFeedbackToModals(host);
    return () => {
      disconnect();
      widget.removeFromDom();
      feedback.remove();
      host.remove();
      style.remove();
    };
  }, []);

  return null;
}
