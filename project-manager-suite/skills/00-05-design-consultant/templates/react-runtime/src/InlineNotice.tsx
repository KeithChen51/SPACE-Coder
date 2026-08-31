import { type ReactNode } from "react";
import {
  Button as AriaButton,
  UNSTABLE_Toast as AriaToast,
  UNSTABLE_ToastContent as AriaToastContent,
  UNSTABLE_ToastQueue as AriaToastQueue,
  UNSTABLE_ToastRegion as AriaToastRegion,
} from "react-aria-components";

export type FeedbackTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface InlineNoticeProps {
  tone?: FeedbackTone;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
  className?: string;
}

export function InlineNotice({
  tone = "info",
  title,
  description,
  action,
  onDismiss,
  dismissLabel = "关闭提示",
  className = "",
}: InlineNoticeProps) {
  return (
    <div
      className={`dc-inline-notice dc-inline-notice--${tone} ${className}`.trim()}
      role={tone === "danger" ? "alert" : "status"}
    >
      <span className="dc-inline-notice__marker" aria-hidden="true" />
      <div className="dc-inline-notice__copy">
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="dc-inline-notice__action">{action}</div> : null}
      {onDismiss ? (
        <button className="dc-icon-button dc-button--ghost" type="button" aria-label={dismissLabel} onClick={onDismiss}>
          <span aria-hidden="true">×</span>
        </button>
      ) : null}
    </div>
  );
}

export interface FeedbackToastAction {
  label: string;
  onAction: () => void;
  closeOnAction?: boolean;
}

export interface FeedbackToast {
  tone?: FeedbackTone;
  title: ReactNode;
  description?: ReactNode;
  action?: FeedbackToastAction;
  dismissLabel?: string;
}

export interface FeedbackToastOptions {
  timeout?: number;
  onClose?: () => void;
}

export class FeedbackQueue {
  readonly source = new AriaToastQueue<FeedbackToast>({ maxVisibleToasts: 1 });

  show(message: FeedbackToast, options: FeedbackToastOptions = {}) {
    const shouldPersist = message.tone === "danger" || Boolean(message.action);
    const timeout = shouldPersist ? undefined : Math.max(options.timeout ?? 5000, 5000);
    return this.source.add(message, { timeout, onClose: options.onClose });
  }

  dismiss(key: string) {
    this.source.close(key);
  }

  clear() {
    this.source.clear();
  }
}

export const feedbackQueue = new FeedbackQueue();

export interface ToastViewportProps {
  queue?: FeedbackQueue;
  label?: string;
}

export function ToastViewport({ queue = feedbackQueue, label = "通知" }: ToastViewportProps) {
  return (
    <AriaToastRegion queue={queue.source} aria-label={label} className="dc-toast-region">
      {({ toast }) => {
        const message = toast.content;
        const tone = message.tone || "info";
        return (
          <AriaToast toast={toast} className={`dc-toast dc-toast--${tone}`}>
            <span className="dc-toast__marker" aria-hidden="true" />
            <AriaToastContent className="dc-toast__content">
              <strong>{message.title}</strong>
              {message.description ? <p>{message.description}</p> : null}
            </AriaToastContent>
            {message.action ? (
              <AriaButton
                className="dc-toast__action"
                onPress={() => {
                  message.action?.onAction();
                  if (message.action?.closeOnAction !== false) queue.dismiss(toast.key);
                }}
              >
                {message.action.label}
              </AriaButton>
            ) : null}
            <AriaButton slot="close" className="dc-toast__close" aria-label={message.dismissLabel || "关闭通知"}>
              <span aria-hidden="true">×</span>
            </AriaButton>
          </AriaToast>
        );
      }}
    </AriaToastRegion>
  );
}
