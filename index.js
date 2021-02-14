const fs = require('fs')
const jsonfile = require('jsonfile')
const exec = require('child_process').exec
const path = require('path')
const { join } = require('path')
const Ctl = require('ipfsd-ctl')

function configPath (ipfsd) {
  return join(ipfsd.path, 'config')
}

function writeConfigFile (ipfsd, config) {
  jsonfile.writeFileSync(configPath(ipfsd), config, { spaces: 2 })
}

function readConfigFile (ipfsd) {
  return jsonfile.readFileSync(configPath(ipfsd))
}

function applyDefaults (ipfsd, { Identity }) {
  const config = readConfigFile(ipfsd)

  config.API = { HTTPHeaders: {} }

  config.Bootstrap = [ '/dnsaddr/record.tint.space/p2p/12D3KooWBrWMfqJhv1GQMtuYxp1NRL1mnJJZfz9iyaecjAkuZund' ]
  config.Swarm = config.Swarm || {}
  config.Swarm.DisableNatPortMap = false
  config.Swarm.ConnMgr = config.Swarm.ConnMgr || {}
  config.Swarm.ConnMgr.GracePeriod = '300s'
  config.Swarm.ConnMgr.LowWater = 50
  config.Swarm.ConnMgr.HighWater = 300

  config.Discovery = config.Discovery || {}
  config.Discovery.MDNS = config.Discovery.MDNS || {}
  config.Discovery.MDNS.Enabled = true

  config.Pubsub = config.Pubsub || {}
  config.Pubsub.Router = 'gossipsub'

  config.Identity = Identity || config.Identity

  writeConfigFile(ipfsd, config)
}

async function spawn ({ repo, ipfsBin, Identity }) {
  const ipfsd = await Ctl.createController({
    type: 'go',
    ipfsHttpModule: require('ipfs-http-client'),
    ipfsBin,
    ipfsOptions: {
      repo,
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
    profiles: ['badgerds']
  })

  applyDefaults(ipfsd, { Identity })

  return ipfsd
}

const rmApiFile = (ipfsd) => fs.unlinkSync(path.join(ipfsd.path, 'api'))
const swarmKey = '/key/swarm/psk/1.0.0/\n/base16/\ncbad12031badbcad2a3cd5a373633fa725a7874de942d451227a9e909733454a'
const copySwarmKey = (ipfsd) => fs.writeFileSync(path.join(ipfsd.path, 'swarm.key'), swarmKey)

function hasLocal (ipfsBin, path) {
  const command = `${ipfsBin} dag stat --offline --config ${path}`
  return function (cid) {
    return new Promise((resolve, reject) => {
      exec(`${command} ${cid}`, (err, stdout, stderr) => {
        if (err || stderr.toLowerCase().includes('error')) {
          return reject(false)
        }
        resolve(true)
      })
    })
  }
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

  copySwarmKey(ipfsd)
  // TODO - update bootstrap addresses in existing config

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

  ipfsd.hasLocal = hasLocal(opts.ipfsBin, ipfsd.path)

  return ipfsd
}
