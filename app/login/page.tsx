import LoginForm from "./LoginForm";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const { error } = await searchParams;

  return (
    <div className="flex flex-1 flex-col items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-indigo-900">⚡ 早押しクイズ</h1>
          <p className="text-indigo-600">メールに届くリンクでログインします</p>
        </div>

        {error === "link" && (
          <p className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 text-center">
            ログインリンクが無効か期限切れです。もう一度送ってください。
          </p>
        )}

        <LoginForm />
      </div>
    </div>
  );
}
