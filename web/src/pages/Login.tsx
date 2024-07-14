import localforage from "localforage";
import axios from 'axios';
import { FunctionComponent, useCallback, useState } from "react";
import { API_URL, BOT_PREFIX } from "../App";

const Login: FunctionComponent = () => {
    const [username, setUsername] = useState('');
    const [showInitial, setShowInitial] = useState(true);
    const [showSecond, setShowSecond] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');
    const [code, setCode] = useState('');
    const [nonce, setNonce] = useState('');

    const getCode = useCallback(async () => {
        if (!username) return;
        setShowInitial(false);

        try {
            const res = await axios.post(`${API_URL}/login/begin`, { user: username });
            setShowSecond(true);
            setCode(res.data.code);
            setNonce(res.data.nonce);
            setUsername(res.data.uid);
        } catch(e: any) {
            setStatusMsg(e?.message || e);
            setShowInitial(true);
            setShowSecond(false);
        }
    }, [ username ]);

    const getSession = useCallback(async () => {
        try {
            const res = await axios.post(`${API_URL}/login/complete`, {
                nonce, code, user: username
            });

            await localforage.setItem('auth', { user: res.data.user, token: res.data.token });

            setShowSecond(false);
            window.location.reload();
        } catch(e: any) {
            setStatusMsg(e?.message || e);
        }
    }, [ nonce, code, username ]);

    return (
        <div style={{ marginLeft: '12px', padding: '16px 0' }}>
            <h1>Log in</h1>
            {statusMsg.length ? <a>{statusMsg}</a> : <br/>}
            <div hidden={!showInitial}>
                <input
                    onChange={e => {
                        setUsername(e.target.value);
                        setStatusMsg('');
                    }}
                    placeholder="Enter your user ID..."
                    style={{ width: "200px", float: "left" }}
                />
                <button onClick={getCode} disabled={username.length == 0}>Continue</button>
            </div>
            <div hidden={!showSecond}>
                <h2>Your code: <a>{code}</a></h2>
                <p style={{ color: "var(--foreground)" }}>
                    Run <code style={{ userSelect: 'all' }}>
                        {BOT_PREFIX}login {code}
                    </code> in any server using AutoMod, then <a
                        onClick={getSession}
                        style={{ cursor: 'pointer' }}
                    >click here</a>.</p>
            </div>
        </div>
    );
}

export default Login;
