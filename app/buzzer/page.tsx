import BuzzerClient from "./BuzzerClient";

type Props = {
  searchParams: Promise<{ room?: string }>;
};

/**
 * スマホ用の早押しボタン。ログイン不要（proxy.ts の PUBLIC_PATHS に入れてある）。
 * 送るのは「押した」という合図だけで、問題データには一切触れない。
 */
export default async function BuzzerPage({ searchParams }: Props) {
  const { room } = await searchParams;

  if (!room) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 p-6 text-center text-gray-200">
        <p>PC のクイズ画面に出ている QR コードを読み取ってください</p>
      </div>
    );
  }

  return <BuzzerClient room={room} />;
}
