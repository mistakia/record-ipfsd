const Ctl = require('ipfsd-ctl')

async function spawn ({ repo, ipfsBin }) {
  const ipfsd = await Ctl.createController({
    ipfsHttpModule: require('ipfs-http-client'),
    ipfsBin,
    ipfsOptions: {
      repo,
      config: {
        Pubsub: {
          Router: 'gossipsub'
        },
        Bootstrap: [
          "/ip4/206.189.77.125/tcp/4001/p2p/QmbxBgAFuyfM1upC72GujTNJeKDKg8nbMnbt3SUX8hrFWm"
        ],
        Swarm: {
          ConnMgr: {
            HighWater: 100,
            LowWater: 20
          }
        }
      },
      preload: {
        enabled: false
      }
    },
    remote: false,
    disposable: false,
    test: false,
    args: [
      '--enable-pubsub-experiment'
    ]
  })

  await ipfsd.init({
    bits: 2048,
    emptyRepo: true
  })

  return ipfsd
}

function rmApiFile (ipfsd) {
  return fs.unlinkSync(path.join(ipfsd.path, 'api'))
}

/**
 *
 * @param {Object} options
 * @param {Function} options.log
 * @param {String} options.repo
 * @param {String} options.ipfsBin
 * @return {Object}
 */
module.exports = async function (opts) {
  const ipfsd = await spawn(opts)

  try {
    await ipfsd.start()
    const { id, addresses } = await ipfsd.api.id()
    opts.log(`[ipfsd] PeerID is ${id}`)
    opts.log(`[ipfsd] Repo is at ${ipfsd.path}`)
    addresses.forEach(address => opts.log(`[ipfsd] Listening at ${address}`))
  } catch (err) {
    if (!err.message.includes('ECONNREFUSED')) {
      throw err
    }

    opts.log('[daemon] removing api file')
    rmApiFile(ipfsd)
    await ipfsd.start()
  }

  return ipfsd
}
