import { useCallback } from "react"
import { useBeforeUnload, useBlocker } from "react-router-dom"
import { ConfirmAction } from "./Feedback"

export function FormGuard({ when, watchQuery = [] }: { when: boolean; watchQuery?: string[] }) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      when && (currentLocation.pathname !== nextLocation.pathname || watchQuery.some(key => new URLSearchParams(currentLocation.search).get(key) !== new URLSearchParams(nextLocation.search).get(key)))
  )
  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        if (when) {
          event.preventDefault()
          event.returnValue = ""
        }
      },
      [when]
    )
  )
  return blocker.state === "blocked" ? (
    <ConfirmAction
      title="Leave without saving?"
      confirmLabel="Leave page"
      onConfirm={() => blocker.proceed()}
      onCancel={() => blocker.reset()}
    >
      Your unsaved changes will be lost.
    </ConfirmAction>
  ) : null
}
