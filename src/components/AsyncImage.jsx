import React from 'react';
import { loadImageFromDB } from '../utils/imageStore';

export default class AsyncImage extends React.PureComponent {
  constructor(props) {
    super(props);
    this.state = {
      dataUrl: null,
      loading: true,
    };
    this._isMounted = false;
  }

  componentDidMount() {
    this._isMounted = true;
    this.resolveSource(this.props.src);
  }

  componentDidUpdate(previousProps) {
    if (previousProps.src !== this.props.src) {
      this.resolveSource(this.props.src);
    }
  }

  componentWillUnmount() {
    this._isMounted = false;
  }

  async resolveSource(src) {
    if (!this._isMounted) return;

    if (!src) {
      this.setState({ dataUrl: null, loading: false });
      return;
    }

    if (!src.startsWith('idb://')) {
      this.setState({ dataUrl: src, loading: false });
      return;
    }

    this.setState({ loading: true });

    try {
      const result = await loadImageFromDB(src);
      if (!this._isMounted) return;
      this.setState({ dataUrl: result, loading: false });
    } catch (error) {
      console.error('AsyncImage error:', error);
      if (!this._isMounted) return;
      this.setState({ dataUrl: null, loading: false });
    }
  }

  render() {
    const { alt, className, fallbackLayout } = this.props;
    const { dataUrl, loading } = this.state;

    if (loading) {
      return (
        <div className={`animate-pulse bg-cyan-900/30 ${className || ''}`}>
          {fallbackLayout}
        </div>
      );
    }

    if (!dataUrl) {
      return fallbackLayout ? (
        <div className={className || ''}>{fallbackLayout}</div>
      ) : null;
    }

    return <img src={dataUrl} alt={alt || ''} className={className} />;
  }
}
