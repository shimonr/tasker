/** Shown after sign-up or join: the account exists but its email must be confirmed from the link first. */
export default function CheckInbox({ email }: { email: string }) {
  return (
    <div role="status" className="mt-6 space-y-3 rounded-3xl bg-leaf-50 px-5 py-6 text-center">
      <p className="text-5xl" aria-hidden="true">
        📬
      </p>
      <h2 className="text-2xl text-grape-900">Check your inbox</h2>
      <p className="text-grape-700">
        We sent a link to <strong className="break-all text-grape-900">{email}</strong>.
      </p>
      <p className="font-semibold text-leaf-600">Open the link in that email to finish. Then you can sign in!</p>
    </div>
  )
}
