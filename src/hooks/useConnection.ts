import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPublicIp, IPV4_URL, IPV6_URL } from '../services/ipService';
import { fetchIpInfo, type IpInfo } from '../services/ipInfoService';

export type Availability = 'checking' | 'available' | 'unavailable';

export interface ConnectionState {
  loading: boolean;
  ipv4: string | null;
  ipv6: string | null;
  ipv4Status: Availability;
  ipv6Status: Availability;
  info: IpInfo | null;
  infoError: string | null;
  error: string | null;
  checkedAt: Date | null;
  refresh: () => void;
}

export function useConnection(): ConnectionState {
  const [loading, setLoading] = useState(true);
  const [ipv4, setIpv4] = useState<string | null>(null);
  const [ipv6, setIpv6] = useState<string | null>(null);
  const [ipv4Status, setIpv4Status] = useState<Availability>('checking');
  const [ipv6Status, setIpv6Status] = useState<Availability>('checking');
  const [info, setInfo] = useState<IpInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    setInfoError(null);
    setIpv4Status('checking');
    setIpv6Status('checking');
    try {
      const [v4, v6] = await Promise.allSettled([
        fetchPublicIp(fetch, IPV4_URL),
        fetchPublicIp(fetch, IPV6_URL),
      ]);
      const a = v4.status === 'fulfilled' ? v4.value : null;
      const b = v6.status === 'fulfilled' ? v6.value : null;
      setIpv4(a);
      setIpv6(b);
      setIpv4Status(a ? 'available' : 'unavailable');
      setIpv6Status(b ? 'available' : 'unavailable'); // normal on IPv4-only networks

      const primary = a ?? b;
      if (!primary) {
        setInfo(null);
        const reason = v4.status === 'rejected' ? v4.reason : null;
        setError(
          reason instanceof Error ? reason.message : 'Could not detect your public IP address.',
        );
        return;
      }
      setCheckedAt(new Date());
      try {
        setInfo(await fetchIpInfo(primary));
      } catch (e) {
        setInfo(null);
        setInfoError(e instanceof Error ? e.message : 'Connection details are unavailable.');
      }
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { loading, ipv4, ipv6, ipv4Status, ipv6Status, info, infoError, error, checkedAt, refresh };
}
