import HostClient from "./HostClient";

/**
 * 司会モード。問題は司会が声で出し、この画面は「QR」と「押した順」だけを出す。
 * ログインした人だけが開ける（参加者はスマホで /buzzer を開くので、ここに来る必要はない）。
 */
export default function HostPage() {
  return <HostClient />;
}
