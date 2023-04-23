import { Button, Container, Form, Nav, Navbar, Card } from 'solid-bootstrap';
import type { Component } from 'solid-js';
import { BitArray } from './lib/binary';
import { AddressV4, calculateSubnetV4, SubnetMaskV4 } from './lib/ip/v4';
import { AddressV6, calculateSubnetV6, SubnetMaskV6 } from './lib/ip/v6';

const App: Component = () => {
  let subnet4 = calculateSubnetV4({
    address: new AddressV4("172.16.40.1"),
    mask: new SubnetMaskV4(19)
  })

  let subnet6 = calculateSubnetV6({
    address: new AddressV6("2001:db8::"),
    mask: new SubnetMaskV6(32)
  })

  return (
    <div>
      <Navbar bg="dark" variant="dark">
        <Container>
          <Navbar.Brand href="#home">Navbar</Navbar.Brand>
          <Nav class="me-auto">

          </Nav>
        </Container>
      </Navbar>
      <Container>
        <Card bg='dark' text='light' class='mt-4'>
          <Card.Body>
            <p>Address: <span>{subnet4.address.toString()}</span></p>
            <p>Network: <span>{subnet4.networkAddress.toString()}</span></p>
            <p>Broadcast: <span>{subnet4.broadcastAddress.toString()}</span></p>
            <p>Host Range: <span>{subnet4.hosts.min.toString()} - {subnet4.hosts.max.toString()}</span></p>
            <p>Host Count: <span>{subnet4.hosts.count.toString()}</span></p>

            <p>Mask: <span>{subnet4.mask.toString()}</span></p>
            <p>Mask Length: <span>{subnet4.mask.length.toString()}</span></p>
          </Card.Body>
        </Card>
        <Card bg='dark' text='light' class='mt-4'>
          <Card.Body>
            <p>Address: <span>{subnet6.address.toString(-1)}</span></p>
            {/* <p>Network: <span>{subnet6.networkAddress.toString(-1)}</span></p>
            <p>Broadcast: <span>{subnet6.broadcastAddress.toString(-1)}</span></p>
            <p>Host Range: <span>{subnet6.hosts.min.toString(0)} - {subnet6.hosts.max.toString(0)}</span></p>
            <p>Host Count: <span>{subnet6.hosts.count.toString()}</span></p> */}

            <p>Mask: <span>{subnet6.mask.toString(-1)}</span></p>
            <p>Mask Length: <span>{subnet6.mask.length.toString()}</span></p>
          </Card.Body>
        </Card>
      </Container>
    </div>
  );
};

export default App;
