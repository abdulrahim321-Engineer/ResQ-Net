'use client';

// Public live tracking. No login: anyone with the link sees the ambulance approach.
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Activity, PhoneCall } from 'lucide-react';
import IncidentTracker from '@/components/IncidentTracker';
import { AppNav } from '@/components/ui';

export default function TrackView() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === 'string' ? params.id : '';

  return (
    <div className="min-h-screen w-full bg-[#030712] text-white p-3 flex flex-col gap-3">
      <AppNav
        title={<>ResQ <span className="text-[#00F5D4]">Net</span> · Live Tracking</>}
        subtitle={<span className="text-[10px] font-mono text-slate-400">Updates every 3 seconds · no account needed</span>}
        color="#FF2A5F"
        icon={<Activity className="animate-pulse" size={22} />}
        right={
          <a href="tel:1122" className="flex items-center gap-1.5 text-xs font-mono font-bold text-white bg-[#FF2A5F] px-3 py-2 rounded-xl">
            <PhoneCall size={14} /> 1122
          </a>
        }
        links={[{ href: '/mobile', label: 'New SOS', color: '#FF2A5F' }]}
      />
      {id ? <IncidentTracker id={id} /> : (
        <p className="text-sm font-mono text-slate-400">This tracking link is incomplete. <Link href="/mobile" className="underline text-[#00F5D4]">Report an emergency</Link></p>
      )}
    </div>
  );
}
