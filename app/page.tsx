import { FibraMapApp } from '../components/FibraMapApp';
import { AuthGate } from '../components/AuthGate';

export default function Home() {
  return <AuthGate>{(cloudEnabled, user) => <FibraMapApp cloudEnabled={cloudEnabled} currentUser={user ?? undefined} />}</AuthGate>;
}
