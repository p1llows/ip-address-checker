export function IpAddressDisplay({ ip }: { ip: string | null }) {
  return (
    <output className={`ip-display${ip ? '' : ' placeholder'}`} aria-label="Your public IP address">
      {ip ?? '—.—.—.—'}
    </output>
  );
}
