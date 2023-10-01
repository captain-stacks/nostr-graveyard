import './App.css'
import {
  SimplePool,
  nip19,
  nip04,
} from 'nostr-tools'
import { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import { useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import LinearProgress from '@mui/material/LinearProgress'

const pool = new SimplePool()
window.pool = pool
window.nip19 = nip19
window.nip04 = nip04
window.pool = pool

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/:npub?" element={<Page/>}/>
      </Routes>
    </Router>
  )
}

function Page() {
  const { npub } = useParams()
  const [pubkey, setPubkey] = useState()
  const [profile, setProfile] = useState({})
  const [followCount, setFollowCount] = useState(0)
  const [progress, setProgress] = useState(0)
  const [contacts, setContacts] = useState([])
  const [relays, setRelays] = useState([
    'wss://relay.nostr.band',
    'wss://nos.lol',
    'wss://relay.damus.io',
    'wss://nostr.bitcoiner.social/',
    'wss://nostr21.com/',
    'wss://nostr-pub.wellorder.net',
    'wss://offchain.pub',
    'wss://nostr.shroomslab.net',
    'wss://relayable.org',
    'wss://nostr.thank.eu'
  ].map(r => [r, {read: true, write: true}]))

  window.setProgress = setProgress

  useEffect(() => {
    let pubkey = npub ? nip19.decode(npub).data : localStorage.getItem('pubkey')
    if (pubkey) {
      setPubkey(pubkey)
    } else {
      setTimeout(() => {
        if (!window.nostr) {
          alert('no nostr')
          return
        }
        window.nostr.getPublicKey()
          .then(pubkey => {
            localStorage.setItem('pubkey', pubkey)
            setPubkey(pubkey)
        }).catch(e => alert('couldnt get pubkey'))
      }, 200)
    }
  }, [npub])

  useEffect(() => {
    if (pubkey) {
      (async () => {
        await findProfile()
      })()
    }
  }, [pubkey])

  function getReadRelays() {
    return relays.filter(r => r[1].read).map(r => r[0])
  }

  function getWriteRelays() {
    return relays.filter(r => r[1].write).map(r => r[0])
  }

  function getAllRelays() {
    return relays.map(r => r[0])
  }

  window.getAllRelays = () => relays.map(r => r[0])
  
  async function findProfile() {
    let events = await pool.list(getAllRelays(), [{
      kinds: [0, 3],
      authors: [pubkey]
    }])
    let profile = events.filter(e => e.kind === 0)
    profile.sort((a, b) => b.created_at - a.created_at)
    profile = profile[0]
    let follows = events.filter(e => e.kind === 3)
    follows.sort((a, b) => b.created_at - a.created_at)
    follows = follows[0]
    follows = follows.tags.filter(t => t[0] === 'p').map(t => t[1])
    setContacts(follows)
    setFollowCount(follows.length)
    setProfile(JSON.parse(profile.content))
  }

  async function loadData() {
    const unfollow = []
    for (const p of contacts) {
        let count = (await pool.list(getReadRelays(), [{
            authors: [p],
            since: Math.floor(new Date('8/1/23') / 1000),
            limit: 1
        }])).length
        console.log(nip19.npubEncode(p), count)
        if (count == 0) {
            unfollow.push(p)
        }
    }
  }

  async function findRelays() {
    let events = await pool.list(getAllRelays(), [{
      kinds: [3, 10_002],
      authors: [await window.nostr.getPublicKey()]
    }])
    events = events.filter(e => !(e.kind === 3 && !e.content))
    events.sort((a, b) => b.created_at - a.created_at)
    let event = events[0]
    let relays = event.kind === 3
      ? Object.entries(JSON.parse(event.content))
      : event.tags
        .filter(t => t[0] === 'r')
        .map(t => [t[1], !t[2]
          ? {read: true, write: true}
          : {read: t[2] === 'read', write: t[2] === 'write'}])
    console.log(relays)
    console.log(event)
    setRelays(relays)
  }

  return (
    <div className="App">
      <header className="App-header">
        <div className="container">
          <img src={profile.picture} alt="" width={100}/>
          {' '}{profile.name}{' follows '}{followCount}{' nostriches'}
          <p/>
          {/* <Link to='/'>Home</Link>{' '}
          <Link to='/npub1jk9h2jsa8hjmtm9qlcca942473gnyhuynz5rmgve0dlu6hpeazxqc3lqz7'>Ser</Link> */}
          <p/>
          <button onClick={loadData}>Find inactive profiles</button>
          <p/>
          Finding inactive profiles...
          <p/>
          <LinearProgress sx={{height:50}} variant="determinate" value={progress} />

        </div>
      </header>
    </div>
  )
}

export default App
