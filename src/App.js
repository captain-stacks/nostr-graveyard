import './App.css'
import {
  SimplePool,
  nip19,
  nip04,
  getPublicKey,
  getEventHash,
  getSignature
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
window.getPublicKey = getPublicKey
window.getEventHash = getEventHash
window.getSignature = getSignature

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/:npub?" element={<Page />} />
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
  const [showProgress, setShowProgress] = useState(false)
  const [months, setMonths] = useState(3)
  const [inactive, setInactive] = useState([])
  const [relays, setRelays] = useState([
    'wss://nos.lol',
    'wss://relay.damus.io',
    'wss://nostr21.com/',
    'wss://nostr-pub.wellorder.net',
    'wss://offchain.pub',
    'wss://relayable.org',
    'wss://nostr.thank.eu',
    'wss://rsslay.nostr.moe',
  ].map(r => [r, { read: true, write: true }]))

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
    setInactive([])
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
    let c = JSON.parse(profile.content)
    c.name = c.name || c.display_name || c.displayName
    setProfile(c)
  }

  async function loadData() {
    setShowProgress(true)
    const CHUNK_SIZE = 20
    const unfollow = []
    for (let i = 0; i < contacts.length; i += CHUNK_SIZE) {
      setProgress(i / contacts.length * 100)
      let promises = contacts.slice(i, i + CHUNK_SIZE).map(async p => [
        p,
        (await pool.list(getReadRelays(), [{
          authors: [p],
          since: Math.floor((new Date() - months * 30 * 24 * 60 * 60 * 1000) / 1000),
          limit: 1
        }])).length
      ])
      let p = await Promise.all(promises)
      p.filter(p => p[1] === 0).forEach(p => unfollow.push(p[0]))
    }
    console.log('unfollow', unfollow)
    setProgress(100)
    setTimeout(() => setShowProgress(false), 2000)

    let events = await pool.list(getAllRelays(), [{
      kinds: [0],
      authors: unfollow
    }])
    let profiles = {}
    events.forEach(e => {
      let list = profiles[e.pubkey] || []
      profiles[e.pubkey] = list
      list.push(e)
    })
  
    // Identify pubkeys that were left out
    const foundPubkeys = Object.keys(profiles)
    const missingPubkeys = unfollow.filter(pubkey => !foundPubkeys.includes(pubkey))
    const missingNpubs = missingPubkeys.map(pubkey => nip19.npubEncode(pubkey))
    console.log('missing', missingNpubs)
  
    events = Object.values(profiles).map(list => {
      list.sort((a, b) => b.created_at - a.created_at)
      return list[0]
    })
    setInactive(events.map(e => {
      const c = JSON.parse(e.content)
      return {
        pubkey: e.pubkey,
        name: c.name || c.display_name || c.displayName,
        picture: c.picture
      }
    }))
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
          ? { read: true, write: true }
          : { read: t[2] === 'read', write: t[2] === 'write' }])
    console.log(relays)
    console.log(event)
    setRelays(relays)
  }

  function handleChangeMonths(e) {
    setMonths(e.target.value)
  }

  return (
    <div className="App">
      <header className="App-header">
        <div className="container">
          <img src={profile.picture} alt="" width={100} />
          {' '}{profile.name}{' follows '}{followCount}{' nostriches'}
          <p />
          {/* <Link to='/'>Home</Link>{' '}
          <Link to='/npub1jk9h2jsa8hjmtm9qlcca942473gnyhuynz5rmgve0dlu6hpeazxqc3lqz7'>Ser</Link> */}
          <p />
          {!showProgress && <>
            <button style={{fontSize: '25px'}} onClick={loadData}>Find profiles</button>{' '}
            inactive for <input type="number" style={{width: '50px', fontSize: '25px'}} value={months} onChange={handleChangeMonths} /> months
          </>}
          {showProgress && <>
            <p />
            Finding inactive profiles...
            <p />
            <LinearProgress sx={{height: 50}} variant="determinate" value={progress} />
          </>}
          <p/>
          {inactive.map(p => <div key={p.pubkey}>
            <Link style={{fontSize: '20px', textDecoration: 'none'}} to={'/' + nip19.npubEncode(p.pubkey)}>
              <img src={p.picture} width={50}/>{' '}{p.name}
            </Link>
          </div>)}
        </div>
      </header>
    </div>
  )
}

export default App
