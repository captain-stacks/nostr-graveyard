import './App.css'
import {
  SimplePool,
  nip19,
  nip04,
  getPublicKey,
  getEventHash,
  finalizeEvent
} from 'nostr-tools'
import { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import { useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import LinearProgress from '@mui/material/LinearProgress'

const pool             = new SimplePool()
window.pool            = pool
window.nip19           = nip19
window.nip04           = nip04
window.getPublicKey    = getPublicKey
window.getEventHash    = getEventHash
window.finalizeEvent   = finalizeEvent

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
  const { npub }                        = useParams()
  const [pubkey, setPubkey]             = useState()
  const [profile, setProfile]           = useState({})
  const [followCount, setFollowCount]   = useState(0)
  const [progress, setProgress]         = useState(0)
  const [contacts, setContacts]         = useState([])
  const [showProgress, setShowProgress] = useState()
  const [burying, setBurying]           = useState()
  const [months, setMonths]             = useState(3)
  const [inactive, setInactive]         = useState([])
  const [selectedApp, setSelectedApp]   = useState()
  const [relays, setRelays]             = useState([
    'wss://nos.lol',
    'wss://relay.damus.io',
    'wss://nostr21.com/',
    'wss://offchain.pub',
    'wss://relayable.org',
    'wss://nostr.thank.eu',
    "wss://nostr.mom",
  ].map(r => [r, { read: true, write: true }]))

  const writeRelays = [
    "wss://nos.lol",
    "wss://relay.damus.io",
    "wss://nostr21.com",
    "wss://offchain.pub",
    "wss://relayable.org",
    'wss://nostr.thank.eu',
    "wss://nostr.mom",
    "wss://nostr.bitcoiner.social",
    "wss://relay.nostr.bg",
    "wss://relay.nostrati.com",
    "wss://nostr.inosta.cc",
    "wss://nostr.fmt.wiz.biz",
    "wss://nostr.plebchain.org",
    "wss://relay.primal.net",
    "wss://bitcoiner.social",
    "wss://nostr.lu.ke",
    "wss://relay.stoner.com",
  ]

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
    return writeRelays
  }

  function getAllRelays() {
    return relays.map(r => r[0])
  }

  window.getReadRelays = getReadRelays
  window.getWriteRelays = getWriteRelays
  window.getAllRelays = getAllRelays

  async function findProfile() {
    setInactive([])
    let events = await pool.querySync(getAllRelays(), {
      kinds: [0, 3],
      authors: [pubkey]
    })
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
    setInactive([])

    const CHUNK_SIZE = 20
    const unfollow = []
    for (let i = 0; i < contacts.length; i += CHUNK_SIZE) {
      setProgress(i / contacts.length * 100)
      let promises = contacts.slice(i, i + CHUNK_SIZE).map(async p => [
        p,
        (await pool.querySync(getReadRelays(), {
          authors: [p],
          since: Math.floor((new Date() - months * 30 * 24 * 60 * 60 * 1000) / 1000),
          limit: 1
        })).length
      ])
      let p = await Promise.all(promises)
      p.filter(p => p[1] === 0).forEach(p => unfollow.push(p[0]))
    }
    console.log('unfollow', unfollow)
    setProgress(100)
    setTimeout(() => setShowProgress(false), 2000)

    let events = await pool.querySync(getAllRelays(), {
      kinds: [0],
      authors: unfollow
    })
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
    let events = await pool.querySync(getAllRelays(), {
      kinds: [3, 10_002],
      authors: [await window.nostr.getPublicKey()]
    })
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

  async function buryThem() {
    const inactivePubkeys = inactive.map(i => i.pubkey)
    setInactive([])
    setBurying(true)

    const events = await Promise.all([
      pool.get(getAllRelays(), {
        kinds: [3],
        authors: [await window.nostr.getPublicKey()]
      }),
      pool.get(getAllRelays(), {
        kinds: [30_000],
        authors: [await window.nostr.getPublicKey()],
        '#d': ['nostr-graveyard']
      })
    ])
    let [contactList, graveyard] = events
    contactList.tags = contactList.tags.filter(f => !inactivePubkeys.includes(f[1]))

    graveyard ||= {
      content: '',
      pubkey: await window.nostr.getPublicKey(),
      kind: 30_000,
      tags: [
        ["title", "Nostr Graveyard"],
        ["description", "inactive profiles"],
        ["d", "nostr-graveyard"]
      ]
    }
    graveyard.id = null
    graveyard.created_at = Math.floor(Date.now() / 1000)
    const existingPubkeys = new Set(graveyard.tags.filter(t => t[0] === 'p').map(t => t[1]))
    graveyard.tags = graveyard.tags.concat(inactivePubkeys.filter(p => !existingPubkeys.has(p)).map(p => ['p', p]))
    graveyard = await window.nostr.signEvent(graveyard)

    contactList.id = null
    contactList.created_at = Math.floor(Date.now() / 1000)
    contactList = await window.nostr.signEvent(contactList)

    Promise.all(pool.publish(writeRelays, graveyard))
      .catch(e => console.log('error publishing', e))
    Promise.all(pool.publish(writeRelays, contactList))
      .catch(e => console.log('error publishing', e))
    
    setBurying(false)
    alert('You have unfollowed the inactive profiles.')
    findProfile()
  }

  function handleChangeMonths(e) {
    setMonths(e.target.value)
  }

  const handleChangeApp = (e) => {
    setSelectedApp(e.target.value)
  }

  const getProfileLink = (pubkey) => {
    const npub = nip19.npubEncode(pubkey)
    switch (selectedApp) {
      case 'primal':
        return `https://primal.net/p/${npub}`
      case 'coracle':
        return `https://coracle.social/people/${npub}`
      case 'snort':
        return `https://snort.social/p/${npub}`
      case 'nostrudel':
        return `https://nostrudel.ninja/#/u/${npub}`
      default:
        return `https://primal.net/p/${npub}`
    }
  }

  return (
    <div className="App">
      <header className="App-header">
        <div className="container">
          <img src={profile.picture} alt="" width={100} />
          {' '}{profile.name}{' follows '}{followCount}{' nostriches'}
          <p />
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
          {inactive.length > 0 && <>
            <label htmlFor="app-select" style={{fontSize: '20px'}}>Open profiles with: </label>
            <select id="app-select" value={selectedApp} onChange={handleChangeApp}>
              <option value="primal">Primal</option>
              <option value="coracle">Coracle</option>
              <option value="nostrudel">Nostrudel</option>
              <option value="snort">Snort</option>
            </select>
            <p/>
            <button style={{fontSize: '25px'}} onClick={buryThem}>Bury them</button>
            <p/>
          </>}
          {burying && <LinearProgress/>}
          {inactive.map(p => <div key={p.pubkey}>
            <div style={{fontSize: '20px', textDecoration: 'none'}}>
              <Link to={'/' + nip19.npubEncode(p.pubkey)}>
                <img src={p.picture} width={50} />
              </Link>{' '}
              <Link to={getProfileLink(p.pubkey)} target='_blank'>
                {p.name}
              </Link>
            </div>
          </div>)}
        </div>
      </header>
    </div>
  )
}

export default App
