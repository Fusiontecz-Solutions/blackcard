"use client";

import { toast } from "react-toastify";
import { useNavigate } from "react-router";
import { createElement, useEffect, useState } from "react";
import { generateDecisionLogicReport } from "@/redux/actions/decision-logic-actions";

function resolveWidgetMode(): "LIVE" | "TEST" {
  const raw = String(import.meta.env.VITE_DECISION_LOGIC_WIDGET_MODE ?? "TEST")
    .trim()
    .toUpperCase();
  return raw === "LIVE" ? "LIVE" : "TEST";
}

export default function DecisionLogicExecutor({
  requestCode,
  businessOwnerId,
  bankAccountId,
}: {
  requestCode?: string;
  businessOwnerId?: number;
  bankAccountId?: number;
} = {}) {
  const navigate = useNavigate();
  const widgetMode = resolveWidgetMode();
  const safeRequestCode = String(requestCode ?? "").trim();
  const safeBusinessOwnerId = Number(businessOwnerId ?? 0);
  const safeBankAccountId = Number(bankAccountId ?? 0);

  const [widgetLoaded, setWidgetLoaded] = useState(false);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://assets.decisionlogic.com/cdn/widgetui/widgetUI.js";
    script.async = true;
    script.onload = () => setWidgetLoaded(true);
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  useEffect(() => {
    if (widgetLoaded && safeRequestCode) {
      const widgetElement = document.getElementById("widget3");
      if (widgetElement) {
        widgetElement.addEventListener("getEvent", handleWidgetEvent, false);
      }

      return () => {
        if (widgetElement) {
          widgetElement.removeEventListener(
            "getEvent",
            handleWidgetEvent,
            false
          );
        }
      };
    }
  }, [widgetLoaded, safeRequestCode]);

  const handleWidgetEvent = async (event: any) => {
    const { detail } = event;

    if (detail) {
      try {
        const response = await generateDecisionLogicReport(
          safeRequestCode,
          safeBusinessOwnerId,
          safeBankAccountId
        );

        if (response.error) {
          throw new Error(response?.error);
        }

        toast.success(response?.message);
        navigate("/decision-logic/success");
      } catch (error) {
        error instanceof Error
          ? toast.error(error.message)
          : toast.error(
            "An unknown error occurred while generating the report."
          );
      }
    }
  };

  return (
    <div className="flex justify-center items-center relative top-56">
      <div className="absolute z-50">
        <div id="widgetHeight" className="widget_section">
          {widgetLoaded && safeRequestCode ? (
            createElement("widget-ui", {
              id: "widget3",
              request_code: safeRequestCode,
              widget_mode: widgetMode,
            })
          ) : (
            <div>
              {safeRequestCode
                ? "Loading widget..."
                : "Missing request code. Open this page with a valid DecisionLogic request code."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
