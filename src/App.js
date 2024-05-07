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
  const [showProgress, setShowProgress] = useState()
  const [burying, setBurying] = useState()
  const [months, setMonths] = useState(3)
  const [inactive, setInactive] = useState([])
  const [relays, setRelays] = useState([
    'wss://nos.lol',
    'wss://relay.damus.io',
    'wss://nostr21.com/',
    'wss://offchain.pub',
    'wss://nostr.thank.eu',
    "wss://nostr.mom",
    'wss://nostr.oxtr.dev',
    'wss://nos.lol/',
    'wss://nostr.fmt.wiz.biz',
    //'wss://brb.io'
  ].map(r => [r, { read: true, write: true }]))

  const writeRelays = [
    "wss://nos.lol",
    "wss://relay.damus.io",
    "wss://nostr21.com",
    "wss://offchain.pub",
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

  const CHUNK_SIZE = 20

  const getInactiveContacts = async (contacts, months) => {
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
    return unfollow
  }
  
  const getEvents = async (unfollow) => {
    return await pool.list(getAllRelays(), [{
      kinds: [0],
      authors: unfollow
    }])
  }
  
  const getProfiles = (events) => {
    let profiles = {}
    events.forEach(e => {
      let list = profiles[e.pubkey] || []
      profiles[e.pubkey] = list
      list.push(e)
    })
    return profiles
  }
  
  const getMissingPubkeys = (unfollow, profiles) => {
    const foundPubkeys = Object.keys(profiles)
    return unfollow.filter(pubkey => !foundPubkeys.includes(pubkey))
  }
  
  const getInactiveProfiles = (profiles) => {
    return Object.values(profiles).map(list => {
      list.sort((a, b) => b.created_at - a.created_at)
      return list[0]
    })
  }
  
  const mapToInactive = (events) => {
    return events.map(e => {
      const c = JSON.parse(e.content)
      return {
        pubkey: e.pubkey,
        name: c.name || c.display_name || c.displayName,
        picture: c.picture
      }
    })
  }
  
  const loadData = async () => {
    setShowProgress(true)
    findProfile()

    const unfollow = await getInactiveContacts(contacts, months)
    console.log('unfollow', unfollow)
    setProgress(100)
    setTimeout(() => setShowProgress(false), 2_000)

    let events = await getEvents(unfollow)
    let profiles = getProfiles(events)

    const missingPubkeys = getMissingPubkeys(unfollow, profiles)
    const missingNpubs = missingPubkeys.map(pubkey => nip19.npubEncode(pubkey))
    console.log('missing', missingNpubs)

    events = getInactiveProfiles(profiles)
    setInactive(mapToInactive(events))
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
    console.log('relays', relays)
  }

  window.findRelays = findRelays

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
          {inactive.length > 0 && <button style={{fontSize: '25px'}} onClick={buryThem}>Bury them</button>}
          {burying && <LinearProgress/>}
          <p/>
          {inactive.map(p => <div key={p.pubkey}>
            <div style={{fontSize: '20px', textDecoration: 'none'}}>
              <Link to={'/' + nip19.npubEncode(p.pubkey)}>
                <img src={p.picture} width={50} />
              </Link>{' '}
              <Link to={'https://primal.net/p/' + nip19.npubEncode(p.pubkey)} target='_blank'>
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
