import { useEffect, useState } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  Cake,
  CalendarClock,
  Camera,
  Check,
  Coffee,
  FileCheck2,
  LayoutDashboard,
  Mail,
  MapPin,
  Monitor,
  Moon,
  Palmtree,
  Pencil,
  Phone,
  Settings2,
  ShieldCheck,
  Sun,
  UserRound,
} from "lucide-react";
import { useApp } from "./context";
import {
  applyPreferences,
  db,
  displayDate,
  readPreferences,
  result,
  rpc,
  savePreferences,
  today,
  type Preferences,
  type Row,
} from "./lib";
import { DatePicker } from "./pickers";
import {
  ErrorBox,
  Loading,
  Modal,
  Panel,
  UserAvatar,
} from "./ui";
import { Corrections, Leaves, Weekoffs } from "./employee";

const tabs = [
  { id: "overview", label: "Overview", icon: UserRound },
  { id: "requests", label: "My requests", icon: CalendarClock },
  { id: "settings", label: "Personal settings", icon: Settings2 },
];
const requestTabs = [
  { id: "leave", label: "Leave requests", icon: Palmtree },
  { id: "weekoff", label: "Week offs", icon: Coffee },
  { id: "correction", label: "Regularization", icon: FileCheck2 },
];

export function ProfilePage() {
  const {
    profile,
    settings,
    busy,
    act,
    navigate,
    profileTab,
    setProfileTab,
    requestTab,
    setRequestTab,
  } = useApp();
  const [editing, setEditing] = useState(false);
  const manager = profile.role === "manager";
  return (
    <div className="profile-page">
      <section className="profile-hero">
        <div className="profile-hero-main">
          <UserAvatar person={profile} size="large" />
          <div>
            <span className="eyebrow">PERSONAL WORKSPACE</span>
            <h1>{profile.name}</h1>
            <p>
              {profile.designation || (manager ? "Manager" : "Team member")}
              {profile.department ? ` · ${profile.department}` : ""}
            </p>
            <div className="profile-hero-meta">
              <span>
                <Mail size={14} /> {profile.email}
              </span>
              {profile.location && (
                <span>
                  <MapPin size={14} /> {profile.location}
                </span>
              )}
              {profile.pronouns && <span>{profile.pronouns}</span>}
            </div>
          </div>
        </div>
        <button className="secondary" onClick={() => setEditing(true)}>
          <Pencil size={16} /> Edit profile
        </button>
      </section>

      <div className="profile-tabs" role="tablist" aria-label="Profile sections">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            role="tab"
            aria-selected={profileTab === id}
            className={profileTab === id ? "selected" : ""}
            key={id}
            onClick={() => setProfileTab(id)}
          >
            <Icon size={17} /> {label}
          </button>
        ))}
      </div>

      {profileTab === "overview" && (
        <ProfileOverview
          profile={profile}
          manager={manager}
          onEdit={() => setEditing(true)}
          onRequests={() => setProfileTab("requests")}
          onSettings={() => navigate("settings")}
        />
      )}

      {profileTab === "requests" && (
        <div className="profile-requests">
          <div className="request-tabs">
            {requestTabs.map(({ id, label, icon: Icon }) => (
              <button
                type="button"
                key={id}
                className={requestTab === id ? "selected" : ""}
                onClick={() => setRequestTab(id)}
              >
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>
          {requestTab === "leave" && <Leaves selfOnly />}
          {requestTab === "weekoff" && (
            <>
              {settings.weekoff_planning === "manager" && (
                <div className="info-strip">
                  <ShieldCheck size={21} />
                  <p>
                    Week-off planning is managed by your administrator. You can
                    still view your scheduled off days here.
                  </p>
                </div>
              )}
              <Weekoffs selfOnly />
            </>
          )}
          {requestTab === "correction" && <Corrections selfOnly />}
        </div>
      )}

      {profileTab === "settings" && (
        <PersonalSettings
          profile={profile}
          manager={manager}
          onOpenWorkspaceSettings={() => navigate("settings")}
        />
      )}

      {editing && (
        <EditProfile
          profile={profile}
          busy={busy}
          act={act}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function ProfileOverview({
  profile,
  manager,
  onEdit,
  onRequests,
  onSettings,
}: {
  profile: Row;
  manager: boolean;
  onEdit: () => void;
  onRequests: () => void;
  onSettings: () => void;
}) {
  const details = [
    {
      icon: BriefcaseBusiness,
      label: "Job title",
      value: profile.designation || "Not added",
    },
    { icon: Cake, label: "Birthday", value: profile.birthday ? displayDate(profile.birthday) : "Not added" },
    { icon: Phone, label: "Phone", value: profile.phone || "Not added" },
    { icon: MapPin, label: "Location", value: profile.location || "Not added" },
    {
      icon: CalendarClock,
      label: "Joined",
      value: profile.joining_date ? displayDate(profile.joining_date) : "—",
    },
    {
      icon: ShieldCheck,
      label: "Employee code",
      value: profile.employee_code || "—",
    },
  ];
  return (
    <div className="profile-grid">
      <div className="profile-main">
        <Panel
          title="About me"
          sub="A short introduction visible to you and your manager."
          actions={
            <button className="text-btn" onClick={onEdit}>
              <Pencil size={15} /> Edit
            </button>
          }
        >
          <div className="padded profile-about">
            {profile.bio ? (
              <p>{profile.bio}</p>
            ) : (
              <div className="profile-empty-copy">
                <strong>Add a short introduction</strong>
                <p>
                  Share what you work on, how you like to collaborate, or
                  anything your team should know.
                </p>
              </div>
            )}
          </div>
        </Panel>
        <Panel title="Personal details" sub="Your profile information">
          <div className="profile-detail-grid">
            {details.map(({ icon: Icon, label, value }) => (
              <div className="profile-detail" key={label}>
                <span>
                  <Icon size={16} />
                </span>
                <div>
                  <small>{label}</small>
                  <strong>{value}</strong>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <div className="profile-side">
        <Panel title="Quick actions" sub="Everything personal, in one place">
          <div className="profile-actions">
            <button type="button" onClick={onRequests}>
              <span className="profile-action-icon leave">
                <CalendarClock size={19} />
              </span>
              <span>
                <strong>Requests</strong>
                <small>Leave, week offs and corrections</small>
              </span>
              <ArrowRight size={17} />
            </button>
            <button type="button" onClick={onEdit}>
              <span className="profile-action-icon profile">
                <UserRound size={19} />
              </span>
              <span>
                <strong>Update profile</strong>
                <small>Photo, birthday, job title and more</small>
              </span>
              <ArrowRight size={17} />
            </button>
            {manager && (
              <button type="button" onClick={onSettings}>
                <span className="profile-action-icon admin">
                  <Settings2 size={19} />
                </span>
                <span>
                  <strong>Organization settings</strong>
                  <small>Policy, domains, branding and leave types</small>
                </span>
                <ArrowRight size={17} />
              </button>
            )}
          </div>
        </Panel>
        <Panel title="Workspace" sub="Your current organisation">
          <div className="workspace-summary">
            <div>
              <span className="workspace-icon">
                <LayoutDashboard size={17} />
              </span>
              <div>
                <strong>{profile.role === "manager" ? "Manager access" : "Employee access"}</strong>
                <small>Role-based workspace</small>
              </div>
            </div>
            <p>
              {manager
                ? "You can manage people, policies, approvals and organization settings."
                : "Your administrator manages policies and schedules. Your personal settings stay private to this browser."}
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function EditProfile({
  profile,
  busy,
  act,
  onClose,
}: {
  profile: Row;
  busy: boolean;
  act: (job: () => Promise<any>, message?: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: profile.name ?? "",
    phone: profile.phone ?? "",
    birthday: profile.birthday ?? "",
    designation: profile.designation ?? "",
    location: profile.location ?? "",
    pronouns: profile.pronouns ?? "",
    bio: profile.bio ?? "",
    avatar_url: profile.avatar_url ?? "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (form.name.trim().length < 2)
      return setError("Enter your full name.");
    if (file && file.size > 4 * 1024 * 1024)
      return setError("Choose an image smaller than 4 MB.");
    const ok = await act(async () => {
      let avatar = form.avatar_url.trim();
      if (file) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${profile.user_id || profile.id}/avatar-${Date.now()}.${ext}`;
        const { error: uploadError } = await db.storage
          .from("avatars")
          .upload(path, file, { contentType: file.type });
        if (uploadError)
          throw new Error(
            `Photo upload failed. ${uploadError.message} If this is a new database, run migration 0004.`,
          );
        avatar = db.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      }
      return rpc("update_my_profile", {
        p_name: form.name.trim(),
        p_phone: form.phone.trim(),
        p_birthday: form.birthday || null,
        p_designation: form.designation.trim(),
        p_location: form.location.trim(),
        p_pronouns: form.pronouns.trim(),
        p_bio: form.bio.trim(),
        p_avatar_url: avatar,
      });
    }, "Profile updated");
    if (ok) onClose();
  }
  return (
    <Modal title="Edit your profile" onClose={onClose}>
      <form className="profile-edit-form" onSubmit={save}>
        <div className="avatar-editor">
          <span className={`avatar large has-image`}>
            {preview || form.avatar_url ? (
              <img src={preview || form.avatar_url} alt="Profile preview" />
            ) : (
              <UserRound size={30} />
            )}
          </span>
          <div>
            <strong>Profile photo</strong>
            <p>JPG, PNG or WebP. Maximum 4 MB.</p>
            <label className="file-button">
              <Camera size={16} /> Choose photo
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const next = e.target.files?.[0] ?? null;
                  if (next && next.size > 4 * 1024 * 1024) {
                    setError("Choose an image smaller than 4 MB.");
                    e.target.value = "";
                    return;
                  }
                  setError("");
                  setFile(next);
                }}
              />
            </label>
            {(preview || form.avatar_url) && (
              <button
                type="button"
                className="text-btn danger"
                onClick={() => {
                  setFile(null);
                  set("avatar_url", "");
                }}
              >
                Remove photo
              </button>
            )}
          </div>
        </div>
        <div className="form-grid">
          <label>
            <span>Full name *</span>
            <input
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </label>
          <label>
            <span>Job title</span>
            <input
              value={form.designation}
              onChange={(e) => set("designation", e.target.value)}
              placeholder="Product designer"
            />
          </label>
          <label>
            <span>Phone</span>
            <input
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="+91 98765 43210"
            />
          </label>
          <label>
            <span>Birthday</span>
            <DatePicker
              value={form.birthday}
              max={today()}
              clearable
              onChange={(value) => set("birthday", value)}
              placeholder="Add your birthday"
            />
          </label>
          <label>
            <span>Location</span>
            <input
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder="Mumbai, India"
            />
          </label>
          <label>
            <span>Pronouns</span>
            <input
              value={form.pronouns}
              onChange={(e) => set("pronouns", e.target.value)}
              placeholder="She / her, he / him, they / them"
            />
          </label>
          <label className="wide">
            <span>About you</span>
            <textarea
              rows={4}
              maxLength={1000}
              value={form.bio}
              onChange={(e) => set("bio", e.target.value)}
              placeholder="A short introduction for your team."
            />
            <small>{form.bio.length}/1000 characters</small>
          </label>
          <label className="wide">
            <span>Or paste a photo URL</span>
            <input
              type="url"
              value={form.avatar_url}
              onChange={(e) => {
                setFile(null);
                set("avatar_url", e.target.value);
              }}
              placeholder="https://example.com/photo.jpg"
            />
          </label>
        </div>
        {error && <ErrorBox error={error} />}
        <footer className="modal-footer">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button disabled={busy} type="submit">
            {busy ? "Saving…" : "Save profile"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function PersonalSettings({
  profile,
  manager,
  onOpenWorkspaceSettings,
}: {
  profile: Row;
  manager: boolean;
  onOpenWorkspaceSettings: () => void;
}) {
  const [prefs, setPrefs] = useState<Preferences>(() => readPreferences());
  const [saved, setSaved] = useState(false);
  const update = (patch: Partial<Preferences>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    savePreferences(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };
  return (
    <div className="personal-settings">
      <div className="settings-title-row">
        <div>
          <span className="eyebrow">PERSONAL SETTINGS</span>
          <h2>Make the workspace yours</h2>
          <p>These preferences stay on this browser and never change organization policy.</p>
        </div>
        {saved && (
          <span className="saved-pill">
            <Check size={15} /> Saved
          </span>
        )}
      </div>
      <Panel title="Appearance" sub="Choose how the workspace looks">
        <div className="settings-block">
          <div className="settings-block-head">
            <strong>Theme</strong>
            <small>Light, dark or match your device</small>
          </div>
          <div className="theme-grid">
            {[
              { id: "light" as const, label: "Light", icon: Sun },
              { id: "dark" as const, label: "Dark", icon: Moon },
              { id: "system" as const, label: "System", icon: Monitor },
            ].map(({ id, label, icon: Icon }) => (
              <button
                type="button"
                key={id}
                className={`theme-card ${prefs.theme === id ? "selected" : ""}`}
                onClick={() => update({ theme: id })}
              >
                <span className={`theme-preview ${id}`}>
                  <span className={`theme-dot ${prefs.theme === id ? "selected" : ""}`} />
                </span>
                <Icon size={16} />
                {label}
                {prefs.theme === id && <Check size={15} className="theme-check" />}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-block">
          <div className="settings-block-head">
            <strong>Density</strong>
            <small>Control how much breathing room the interface has</small>
          </div>
          <div className="segmented settings-segmented">
            {[
              { id: "comfortable" as const, label: "Comfortable" },
              { id: "compact" as const, label: "Compact" },
            ].map(({ id, label }) => (
              <button
                type="button"
                key={id}
                className={prefs.density === id ? "selected" : ""}
                onClick={() => update({ density: id })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-block">
          <label className="preference-line">
            <span>
              <strong>Reduce motion</strong>
              <small>Turn off decorative animation and transitions</small>
            </span>
            <input
              type="checkbox"
              checked={prefs.reduceMotion}
              onChange={(e) => update({ reduceMotion: e.target.checked })}
            />
          </label>
        </div>
      </Panel>
      <Panel title="Account" sub="Your workspace account details">
        <div className="settings-account">
          <div>
            <UserAvatar person={profile} />
            <div>
              <strong>{profile.name}</strong>
              <small>{profile.email}</small>
            </div>
          </div>
          <dl>
            <div>
              <dt>Role</dt>
              <dd>{manager ? "Manager" : "Employee"}</dd>
            </div>
            <div>
              <dt>Employee code</dt>
              <dd>{profile.employee_code || "—"}</dd>
            </div>
            <div>
              <dt>Member since</dt>
              <dd>{profile.joining_date ? displayDate(profile.joining_date) : "—"}</dd>
            </div>
          </dl>
          {manager && (
            <button type="button" className="secondary" onClick={onOpenWorkspaceSettings}>
              <Settings2 size={16} /> Open organization settings
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </Panel>
    </div>
  );
}
