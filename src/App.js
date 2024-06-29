import './App.css'
import {
  SimplePool,
  nip19,
  nip04,
  getPublicKey,
  getEventHash
} from 'nostr-tools'
import { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import { useParams } from 'react-router-dom'
import Mutuals from './Mutuals'
import SocialGraph from './SocialGraph'
import Box from '@mui/material/Box'
import LinearProgress from '@mui/material/LinearProgress'

const pool = new SimplePool()
window.pool = pool
window.nip19 = nip19
window.nip04 = nip04
window.pool = pool
window.getPublicKey = getPublicKey
window.getEventHash = getEventHash

export default function App() {
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
  const [cliques, setCliques] = useState([])

  const [relays, setRelays] = useState([
    'wss://nos.lol',
    'wss://relay.damus.io',
    'wss://nostr21.com/',
    'wss://offchain.pub',
    'wss://nostr.thank.eu',
    "wss://nostr.mom",
    // "ws://umbrel.local:4848"
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
    setCliques([])
    let events = await pool.querySync(getReadRelays(), {
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
    follows.push(pubkey)
    setContacts(follows)
    const followCount = follows.length
    setFollowCount(followCount)
    let c = JSON.parse(profile.content)
    c.name = c.name || c.display_name || c.displayName || c.username
    c.npub = nip19.npubEncode(pubkey)
    setProfile(c)

    let allEvents = await pool.querySync(getReadRelays(), {
      kinds: [0, 3],
      authors: follows
    })

    let profileMap = {}
    allEvents.filter(e => e.kind === 0).forEach(e => {
      let list = profileMap[e.pubkey] || []
      profileMap[e.pubkey] = list
      list.push(e)
    })
    events = Object.values(profileMap).map(list => {
      list.sort((a, b) => b.created_at - a.created_at)
      return list[0]
    })
    // console.log(events)
    profileMap = {}
    events.forEach(e => {
      const c = JSON.parse(e.content)
      profileMap[e.pubkey] = {
        pubkey: e.pubkey,
        name: c.name || c.display_name || c.displayName,
        picture: c.picture,
        website: c.website
      }
    })
    // console.log(profileMap)

    let followMap = {}
    allEvents.filter(e => e.kind === 3).forEach(e => {
      let list = followMap[e.pubkey] || []
      followMap[e.pubkey] = list
      list.push(e)
    })

    events = Object.values(followMap).map(list => {
      list.sort((a, b) => b.created_at - a.created_at)
      return list[0]
    })
    //console.log(events)

    let followedBy = {}
    events.filter(e => profileMap[e.pubkey]).forEach(follower => {
      follower.tags.filter(t => t[0] === 'p').map(t => t[1]).forEach(followee => {
        followedBy[followee] = followedBy[followee] || new Set()
        followedBy[followee].add(follower.pubkey)
      })
    })

    let mutuals = new Mutuals()
    const sg = new SocialGraph()

    for (let [k, v] of Object.entries(followedBy)) {
      for (let f of v) {
        mutuals.addEdge(k, f)
      }
    }
    let mc = mutuals.findMutualConnections()
    // console.log('mutual', mc)
    mc.forEach(p => {
      sg.addEdge(p[0], p[1])
    })
    const cl = sg.findCliques().sort((a, b) => b.size - a.size)
    // console.log(cl)
    //setInactive(await loadData(follows))
    Promise.all(cl.map(item => loadData(profileMap, Array.from(item)))).then(setCliques)
  }

  function loadData(profileMap, unfollow) {
    return unfollow.filter(p => '' !== pubkey).map(p => profileMap[p])
  }

  return (
    <div className="App">
      <header className="App-header">
        <div className="container">
          <img src={profile.picture} alt="" width={100} />
          {' '}{profile.name}'s webrings
          <p />
          {inactive.map(p => <div key={p.pubkey}>
            <div style={{ fontSize: '20px', textDecoration: 'none' }}>
              <Link to={'/' + nip19.npubEncode(p.pubkey)}>
                <img src={p.picture} width={50} />
              </Link>{' '}
              <Link to={p.website} target='_blank'>
                {p.website}
              </Link>
            </div>
          </div>)}
          {cliques.map((clique, index) => (
            <div key={index}>
              <h5>Ring #{index + 1} (size: {clique.length})</h5>
              <table>
                <tbody>
                  {clique.map(p => (
                    <tr key={p.pubkey}>
                      <td>
                        <Link to={'/' + nip19.npubEncode(p.pubkey)}>
                          <img src={p.picture} alt={p.name}/>
                        </Link>
                      </td>
                      <td>
                        {p.name}
                      </td>
                      <td>
                        <Link to={p.website} target='_blank'>
                          {p.website}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </header>
    </div>
  )
}
