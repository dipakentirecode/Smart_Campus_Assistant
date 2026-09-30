import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown, ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, FileText,
  GraduationCap, LoaderCircle, LogOut, MessageCircle, Plus, Send, ShieldCheck,
  Sparkles, ThumbsDown, ThumbsUp, Trash2, UploadCloud, X
} from "lucide-react";
import { api } from "./api.js";

const suggestions = [
  "When do the semester exams begin?",
  "Show me the Machine Learning Unit 3 syllabus",
  "What are the current fee payment dates?",
  "Where can I find the admission guidelines?"
];

function AuthScreen({ onSignedIn }) {
  const [registering, setRegistering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      const result = await api(`/auth/${registering ? "register" : "login"}`, {
        method: "POST",
        body: JSON.stringify(body)
      });
      onSignedIn(result.user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="brand-lockup">
          <div className="brand-mark"><GraduationCap size={23} /></div>
          <span>MU <b>·</b> CAMPUS GUIDE</span>
        </div>
        <div className="auth-copy">
          <span className="eyebrow"><Sparkles size={14} /> YOUR UNIVERSITY, IN ONE PLACE</span>
          <h1>Good answers.<br /><em>Grounded in your campus.</em></h1>
          <p>Find clear answers in university notices, syllabi and circulars—with the source right there.</p>
        </div>
        <form onSubmit={submit} className="auth-form">
          {registering && <label>Your name<input name="name" autoComplete="name" minLength="2" maxLength="80" required placeholder="Full name" /></label>}
          <label>University email<input type="email" name="email" autoComplete="email" required placeholder="you@university.edu" /></label>
          <label>Password<input type="password" name="password" autoComplete={registering ? "new-password" : "current-password"} minLength="10" maxLength="128" required placeholder={registering ? "At least 10 characters" : "Your password"} /></label>
          {error && <div className="error-banner" role="alert">{error}</div>}
          <button className="primary-button w-full" disabled={busy}>
            {busy ? <LoaderCircle className="animate-spin" size={17} /> : <>{registering ? "Create student account" : "Sign in"} <ArrowRight size={17} /></>}
          </button>
        </form>
        <p className="auth-switch">{registering ? "Already have an account?" : "New to Campus Guide?"}{" "}
          <button onClick={() => { setRegistering(!registering); setError(""); }}>{registering ? "Sign in" : "Create an account"}</button>
        </p>
        <div className="auth-foot"><ShieldCheck size={15} /> Answers are sourced from university documents</div>
      </section>
      <aside className="auth-art">
        <div className="art-orb orb-a" /><div className="art-orb orb-b" />
        <div className="art-content">
          <div className="art-label"><span /> BUILT FOR MU STUDENTS</div>
          <div className="art-quote">“The right information,<br />at the right moment.”</div>
          <div className="art-source"><div className="source-icon"><FileText size={18} /></div><div><b>Always verifiable</b><span>Every answer links back to its source</span></div><Check size={17} className="ml-auto text-teal-200" /></div>
          <div className="art-landscape"><span /><span /><span /><span /><span /><span /><span /></div>
        </div>
        <div className="art-caption">MANGALAYATAN UNIVERSITY <span>·</span> ALIGARH</div>
      </aside>
    </main>
  );
}

function MessageBubble({ message, conversationId, onFeedback }) {
  const mine = message.role === "user";
  return (
    <div className={`message-row ${mine ? "message-mine" : ""}`}>
      {!mine && <div className="assistant-avatar"><Sparkles size={15} /></div>}
      <div className={`message-content ${mine ? "message-user" : "message-assistant"}`}>
        <div className="message-text">{message.content}</div>
        {!mine && message.citations?.length > 0 && (
          <div className="citations">
            <span className="citation-heading"><BookOpen size={13} /> SOURCE{message.citations.length > 1 ? "S" : ""}</span>
            <div className="citation-list">
              {message.citations.map((citation, index) => (
                <span className="citation-chip" key={`${citation.documentId}-${citation.page}-${index}`}>
                  <FileText size={13} /><span>{citation.filename}</span><b>p. {citation.page}</b>
                </span>
              ))}
            </div>
          </div>
        )}
        {!mine && message._id && (
          <div className="feedback-row">
            <span>Was this helpful?</span>
            <button aria-label="Helpful" title="Helpful" className={message.feedback === "up" ? "feedback-selected" : ""} onClick={() => onFeedback(message._id, "up")}><ThumbsUp size={14} /></button>
            <button aria-label="Not helpful" title="Not helpful" className={message.feedback === "down" ? "feedback-selected" : ""} onClick={() => onFeedback(message._id, "down")}><ThumbsDown size={14} /></button>
          </div>
        )}
      </div>
      {mine && <div className="user-avatar">{message.name?.[0] || "Y"}</div>}
    </div>
  );
}

function AdminPanel() {
  const [documents, setDocuments] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileInput = useRef(null);

  const loadDocuments = useCallback(async () => {
    try {
      const result = await api("/documents");
      setDocuments(result.documents);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  async function upload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setNotice("");
    setError("");
    const body = new FormData();
    body.append("file", file);
    try {
      await api("/documents", { method: "POST", body });
      setNotice(`${file.name} is indexed and ready to search.`);
      await loadDocuments();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function remove(document) {
    if (!window.confirm(`Delete "${document.filename}" and remove it from search?`)) return;
    setError("");
    try {
      await api(`/documents/${encodeURIComponent(document._id)}`, { method: "DELETE" });
      setDocuments((current) => current.filter((item) => item._id !== document._id));
      setNotice(`${document.filename} was removed.`);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <div className="admin-view">
      <div className="view-heading">
        <div><span className="eyebrow">KNOWLEDGE BASE</span><h1>University documents</h1><p>Manage the trusted sources behind every answer.</p></div>
        <button className="primary-button" disabled={busy} onClick={() => fileInput.current?.click()}>{busy ? <LoaderCircle className="animate-spin" size={17} /> : <UploadCloud size={17} />} Upload document</button>
        <input ref={fileInput} type="file" accept=".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={upload} hidden />
      </div>
      <div className="upload-hint"><UploadCloud size={17} /><span><b>PDF, DOCX or TXT</b> · max 15 MB · text is extracted and indexed automatically</span></div>
      {error && <div className="error-banner" role="alert">{error}</div>}
      {notice && <div className="success-banner"><Check size={16} />{notice}</div>}
      <div className="document-card">
        <div className="table-head"><b>INDEXED DOCUMENTS <span>{documents.length}</span></b><span>Newest first</span></div>
        {loading ? <div className="empty-state"><LoaderCircle className="animate-spin" size={19} /> Loading documents…</div> :
          documents.length === 0 ? <div className="empty-state"><FileText size={25} /><span>No documents yet. Upload your first notice or syllabus.</span></div> :
          <div className="document-list">{documents.map((doc) => (
            <div className="document-item" key={doc._id}>
              <div className="document-type"><FileText size={19} /></div>
              <div className="document-info"><b>{doc.filename}</b><span>{(doc.sizeBytes / 1024 / 1024).toFixed(2)} MB <i>·</i> {doc.chunkCount} searchable sections <i>·</i> {new Date(doc.createdAt).toLocaleDateString()}</span></div>
              <button className="icon-button danger-button" aria-label={`Delete ${doc.filename}`} title="Delete document" onClick={() => remove(doc)}><Trash2 size={16} /></button>
            </div>
          ))}</div>}
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [view, setView] = useState("chat");
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const loadConversations = useCallback(async () => {
    try {
      const result = await api("/chat/conversations");
      setConversations(result.conversations);
    } catch (requestError) {
      setError(requestError.message);
    }
  }, []);

  useEffect(() => {
    api("/auth/me").then((result) => setUser(result.user)).catch(() => {}).finally(() => setChecking(false));
  }, []);
  useEffect(() => {
    if (user) loadConversations();
  }, [user, loadConversations]);
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function openConversation(id) {
    setError("");
    try {
      const result = await api(`/chat/conversations/${id}`);
      setConversationId(id);
      setMessages(result.conversation.messages);
      setView("chat");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function newChat() {
    setConversationId(null);
    setMessages([]);
    setQuestion("");
    setError("");
    setView("chat");
    inputRef.current?.focus();
  }

  async function sendMessage(event) {
    event?.preventDefault();
    const content = question.trim();
    if (!content || busy) return;
    setQuestion("");
    setError("");
    setMessages((current) => [...current, { role: "user", content, name: user.name }]);
    setBusy(true);
    try {
      const result = await api("/chat", {
        method: "POST",
        body: JSON.stringify({ question: content, ...(conversationId ? { conversationId } : {}) })
      });
      setConversationId(result.conversationId);
      setMessages((current) => [...current.slice(0, -1), { role: "user", content, _id: result.userMessageId, name: user.name }, result.message]);
      await loadConversations();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  async function submitFeedback(messageId, rating) {
    if (!conversationId) return;
    try {
      await api("/chat/feedback", {
        method: "POST",
        body: JSON.stringify({ conversationId, messageId, rating })
      });
      setMessages((current) => current.map((message) => message._id === messageId ? { ...message, feedback: rating } : message));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function signOut() {
    try { await api("/auth/logout", { method: "POST" }); }
    finally {
      setUser(null);
      setMessages([]);
      setConversations([]);
      setConversationId(null);
    }
  }

  if (checking) return <div className="full-loader"><LoaderCircle className="animate-spin" size={22} />Preparing your campus guide…</div>;
  if (!user) return <AuthScreen onSignedIn={setUser} />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><div className="brand-mark"><GraduationCap size={21} /></div><div><b>Campus Guide</b><span>MANGALAYATAN UNIVERSITY</span></div></div>
        <button className="new-chat-button" onClick={newChat}><Plus size={17} /> New conversation <span>⌘ K</span></button>
        {user.role === "admin" && <button className={`side-nav ${view === "documents" ? "side-nav-active" : ""}`} onClick={() => setView("documents")}><BookOpen size={17} /> Knowledge base <ArrowRight size={14} /></button>}
        <div className="history-heading">RECENT CONVERSATIONS</div>
        <div className="history-list">
          {conversations.map((conversation) => (
            <button key={conversation.id} className={`history-item ${conversation.id === conversationId ? "history-active" : ""}`} onClick={() => openConversation(conversation.id)}>
              <MessageCircle size={15} /><span>{conversation.title}</span>
            </button>
          ))}
          {conversations.length === 0 && <p className="history-empty">Your conversations will appear here.</p>}
        </div>
        <div className="sidebar-bottom">
          <div className="privacy-note"><ShieldCheck size={16} /><span><b>Trusted campus sources</b><small>Answers include document citations.</small></span></div>
          <div className="profile-row"><div className="profile-avatar">{user.name[0]?.toUpperCase()}</div><div className="profile-copy"><b>{user.name}</b><span>{user.role === "admin" ? "Administrator" : "Student"}</span></div><button className="icon-button" aria-label="Sign out" title="Sign out" onClick={signOut}><LogOut size={17} /></button></div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="mobile-brand"><div className="brand-mark"><GraduationCap size={19} /></div><b>Campus Guide</b></div>
          <div className="breadcrumb"><span>MU CAMPUS</span><ArrowRight size={13} />{view === "documents" ? <b>Knowledge base</b> : <b>Assistant</b>}</div>
          <div className="topbar-user"><span className="status-dot" /> Document-grounded answers <ChevronDown size={14} /></div>
        </header>
        {view === "documents" && user.role === "admin" ? <AdminPanel /> : (
          <section className="chat-view">
            <div className="chat-scroll">
              {messages.length === 0 ? (
                <div className="welcome">
                  <div className="welcome-icon"><Sparkles size={21} /></div>
                  <span className="eyebrow">YOUR CAMPUS, MADE SIMPLE</span>
                  <h1>What would you like<br />to <em>know today?</em></h1>
                  <p>Ask about exams, your syllabus, admissions, fees and more.<br className="hidden sm:block" /> I'll look through official university documents for you.</p>
                  <div className="suggestion-grid">
                    {suggestions.map((suggestion, index) => (
                      <button key={suggestion} className="suggestion-card" onClick={() => { setQuestion(suggestion); inputRef.current?.focus(); }}>
                        <span>{suggestion}</span><span className="suggestion-arrow"><ArrowRight size={15} /></span>
                      </button>
                    ))}
                  </div>
                  <div className="welcome-foot"><ShieldCheck size={15} /> Answers grounded in university documents <span>·</span> Sources included</div>
                </div>
              ) : (
                <div className="message-list">{messages.map((message, index) => <MessageBubble key={message._id || `pending-${index}`} message={message} conversationId={conversationId} onFeedback={submitFeedback} />)}</div>
              )}
              {busy && <div className="typing-indicator"><div className="assistant-avatar"><Sparkles size={15} /></div><span><i /><i /><i /></span><small>Searching university documents…</small></div>}
              <div ref={scrollRef} />
            </div>
            <div className="composer-area">
              {error && <div className="chat-error"><span>{error}</span><button aria-label="Dismiss" onClick={() => setError("")}><X size={15} /></button></div>}
              <form className="composer" onSubmit={sendMessage}>
                <textarea ref={inputRef} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} placeholder="Ask anything about university life…" rows="1" maxLength="2000" aria-label="Your question" />
                <div className="composer-bottom"><span><Sparkles size={13} /> Answers are based on official university documents</span><button className="send-button" disabled={!question.trim() || busy} aria-label="Send question"><Send size={16} /></button></div>
              </form>
              <p className="disclaimer">Please verify important dates and policies with the relevant university office.</p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
