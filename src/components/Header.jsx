// src/components/Header.jsx
import React, { useEffect, useRef } from "react";

export default function Header({
  session,
  isAdmin,
  isManager,
  page,
  setPage,
  setShowAdminPanel,
  handleLogout,
  currentProfile,
  showProfileMenu,
  setShowProfileMenu,
  setShowProfileModal,
}) {
  const menuRef = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
    };

    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [setShowProfileMenu]);

  const first = (currentProfile?.first_name || "").trim();
  const last = (currentProfile?.last_name || "").trim();

  const initials = `${first?.[0] || ""}${last?.[0] || ""}`.toUpperCase() || "U";

  const displayName =
    [currentProfile?.first_name, currentProfile?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || session.user.email;

  return (
    <header className="app-header">
      <div className="header-left">
        <h1>Keepintouch</h1>
        <span className="badge">Rester en contact</span>
      </div>

      <div className="header-right">
    

        <button
          className="btn-secondary"
          onClick={() => setPage(page === "clients" ? "dashboard" : "clients")}
          type="button"
        >
          {page === "clients" ? "Tableau de bord" : "Clients"}
        </button>

        {isAdmin && (
          <button
            className="btn-secondary"
            onClick={() => setShowAdminPanel(true)}
            type="button"
          >
            Paramètres
          </button>
        )}

        <div className="profile-menu-wrap" ref={menuRef}>
          <button
            type="button"
            className="profile-bubble"
            onClick={() => setShowProfileMenu((prev) => !prev)}
            title="Mon profil"
          >
            {initials}
          </button>

          {showProfileMenu && (
            <div className="profile-dropdown">
              <div className="profile-dropdown-head">
                <div className="profile-dropdown-name">{displayName}</div>
                <div className="profile-dropdown-email">{session.user.email}</div>
              </div>

              <button
                type="button"
                className="profile-dropdown-item"
                onClick={() => {
                  setShowProfileModal(true);
                  setShowProfileMenu(false);
                }}
              >
                Mon profil
              </button>

              <button
                type="button"
                className="profile-dropdown-item"
                onClick={() => {
                  setShowProfileMenu(false);
                  handleLogout();
                }}
              >
                Se déconnecter
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}