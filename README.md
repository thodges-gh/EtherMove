# EtherMove - A contract that transfers the amount of Ether in USD

### Deployment Parameters

- LinkToken contract address
- Oracle contract address
- Depositor address
- Beneficiary address

### Building

```bash
$ npm install
$ ./node_modules/.bin/truffle compile
```

### Testing

```bash
$ ./node_modules/.bin/ganache-cli
$ ./node_modules/.bin/truffle test --network development
```