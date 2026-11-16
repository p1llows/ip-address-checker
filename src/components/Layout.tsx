import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

const links = [
  { to: '/', label: 'My IP', end: true },
  { to: '/lookup', label: 'Lookup' },
  { to: '/tools', label: 'Tools' },
  { to: '/about', label: 'About' },
];

export function Layout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="site-header-inner">
          <NavLink to="/" className="brand" end>
            IP Tools
          </NavLink>
          <nav aria-label="Primary">
            <ul className="nav-list">
              {links.map((l) => (
                <li key={l.to}>
                  <NavLink to={l.to} end={l.end} className="nav-link">
                    {l.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>
      <main id="main" className="page" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="site-footer">
        No account, no tracking. Your IP details are fetched from third-party services — see{' '}
        <NavLink to="/about">About</NavLink>.
      </footer>
    </>
  );
}
