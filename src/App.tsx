import { Button, Container, Form, Nav, Navbar, Card } from 'solid-bootstrap';
import type { Component } from 'solid-js';
import { AddressV4, calculateSubnetV4, SubnetMaskV4 } from './lib/ip/v4';

const App: Component = () => {
  let subnet = calculateSubnetV4({
    address: new AddressV4("172.16.40.1"),
    mask: new SubnetMaskV4(19)
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
        <Card bg='dark' text='light'>

          <Card.Body>

            <p>Address: <span>{subnet.address.toString()}</span></p>
            <p>Network: <span>{subnet.networkAddress.toString()}</span></p>
            <p>Broadcast: <span>{subnet.broadcastAddress.toString()}</span></p>
            <p>Host Range: <span>{subnet.hosts.min.toString()} - {subnet.hosts.max.toString()}</span></p>
            <p>Host Count: <span>{subnet.hosts.count.toString()}</span></p>

            <p>Mask: <span>{subnet.mask.toString()}</span></p>
            <p>Mask Length: <span>{subnet.mask.length.toString()}</span></p>

          </Card.Body>
        </Card>
      </Container>
    </div>
  );
};

export default App;
